import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import UseAuth from '../hooks/UseAuth';
import UseAxiosSecure from '../hooks/UseAxiosSecure';

// const BACKEND_URL = 'https://chatbot.getsoko.app';
const BACKEND_URL = "http://localhost:8080";

const Dashboard = () => {
  const { user, logOutUser } = UseAuth();
  const axiosSecure = UseAxiosSecure();

  const [activeTab, setActiveTab] = useState('chat');
  const [sessions, setSessions] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  // Mobile UI State
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  // Admin States
  const [team, setTeam] = useState([]);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'agent' });
  const [adminStatus, setAdminStatus] = useState({ type: '', msg: '' });

  // WebRTC States
  const [isCalling, setIsCalling] = useState(false);
  const [callStatus, setCallStatus] = useState('');

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const rtcConfig = {
      iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
      ]
  };

  const playAlert = () => {
    try {
      const audio = new Audio('/alert.mp3');
      audio.play();
      const originalTitle = document.title;
      document.title = "(1) New Message!";
      setTimeout(() => { document.title = originalTitle; }, 4000);
    } catch (err) {}
  };

  useEffect(() => {
    if (!user?.id) return; 
    socketRef.current = io(BACKEND_URL, { auth: { agentId: user.id } });

    const fetchSessions = async () => {
      try {
        const res = await axiosSecure.get(`/chat/sessions/queued`);
        if (res.data.success) setSessions(res.data.data);
      } catch (err) {}
    };
    
    fetchSessions();
    socketRef.current.on('refresh_queue', () => { fetchSessions(); playAlert(); });

    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, [user?.id]); 

  useEffect(() => {
    if (!activeTicket?._id) return; 

    const fetchHistory = async () => {
      try {
        const res = await axiosSecure.get(`/chat/session/${activeTicket._id}/messages`);
        if (res.data.success) setMessages(res.data.data);
      } catch (err) {}
    };

    fetchHistory();
    socketRef.current.emit('join_session', activeTicket._id);

    const handleNewMessage = (msg) => {
      if (msg.sessionId === activeTicket._id && msg.senderId !== user?.id) {
        setMessages((prev) => [...prev, msg]);
        playAlert(); 
      }
    };

    const handleAnswer = async (data) => {
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            setCallStatus('Call Active 🎙️');
        }
    };

    const handleIceCandidate = async (data) => {
        if (peerConnectionRef.current) await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    };

    const handleCallEnded = () => stopCall();

    socketRef.current.on('receive_message', handleNewMessage);
    socketRef.current.on('call_answered', handleAnswer);
    socketRef.current.on('ice_candidate', handleIceCandidate);
    socketRef.current.on('call_ended', handleCallEnded);
    
    return () => {
      if (socketRef.current) {
        socketRef.current.off('receive_message', handleNewMessage);
        socketRef.current.off('call_answered', handleAnswer);
        socketRef.current.off('ice_candidate', handleIceCandidate);
        socketRef.current.off('call_ended', handleCallEnded);
      }
    };
  }, [activeTicket?._id, user?.id]); 

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!inputValue.trim() || !activeTicket) return;

    const msgData = { sessionId: activeTicket._id, senderType: 'agent', senderId: user.id, content: inputValue };
    socketRef.current.emit('send_message', msgData);
    setMessages((prev) => [...prev, msgData]);
    setInputValue('');

    if (activeTicket.status === 'queued') {
      try {
        await axiosSecure.patch(`/chat/session/${activeTicket._id}/status`, { status: 'active', agentId: user.id, agentName: user.name });
        setActiveTicket((prev) => ({ ...prev, status: 'active' }));
        setSessions((prev) => prev.map((t) => t._id === activeTicket._id ? { ...t, status: 'active' } : t));
      } catch (err) {}
    }
  };

  const stopCall = () => {
      if (peerConnectionRef.current) peerConnectionRef.current.close();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
      peerConnectionRef.current = null;
      localStreamRef.current = null;
      setIsCalling(false);
      setCallStatus('');
  };

  const startCall = async () => {
      if (!activeTicket) return;
      try {
          setCallStatus('Requesting mic...');
          // STUDIO QUALITY AUDIO CONSTRAINTS
          const stream = await navigator.mediaDevices.getUserMedia({ 
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 } 
          });
          localStreamRef.current = stream;
          setIsCalling(true);
          setCallStatus('Ringing...');

          const pc = new RTCPeerConnection(rtcConfig);
          peerConnectionRef.current = pc;
          stream.getTracks().forEach(track => pc.addTrack(track, stream));

          pc.ontrack = (event) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0]; };
          pc.onicecandidate = (event) => { if (event.candidate) socketRef.current.emit('ice_candidate', { sessionId: activeTicket._id, candidate: event.candidate }); };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current.emit('call_user', { sessionId: activeTicket._id, offer: offer });

      } catch (error) {
          alert("Please allow microphone access to make a call.");
          stopCall();
      }
  };

  const resolveTicket = async () => {
    if (!activeTicket) return;
    try {
      stopCall(); 
      await axiosSecure.patch(`/chat/session/${activeTicket._id}/status`, { status: 'closed' });
      socketRef.current.emit('close_session', activeTicket._id);
      setSessions((prev) => prev.filter((t) => t._id !== activeTicket._id));
      setActiveTicket(null);
      setIsMobileChatOpen(false); // Go back to queue on mobile
    } catch (err) {}
  };

  const handleTicketSelect = (ticket) => {
      setActiveTicket(ticket);
      setIsMobileChatOpen(true);
  };

  const handleCreateAgent = async (e) => {
    e.preventDefault();
    setAdminStatus({ type: '', msg: '' });
    try {
        const res = await axiosSecure.post('/auth/register', formData);
        if (res.data.success) {
            setAdminStatus({ type: 'success', msg: `${formData.name} added!` });
            setFormData({ name: '', email: '', password: '', role: 'agent' });
            const teamRes = await axiosSecure.get('/auth/agents');
            if (teamRes.data.success) setTeam(teamRes.data.data);
        }
    } catch (err) {
        setAdminStatus({ type: 'error', msg: 'Failed to create team member.' });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* TOP NAVIGATION BAR - PREMIUM SAAS LOOK */}
      <div className="bg-white border-b border-slate-200 flex justify-between items-center px-4 md:px-6 py-3 shadow-sm z-20 flex-shrink-0">
        <div className="flex items-center gap-4 md:gap-8">
            <h1 className="font-extrabold text-xl md:text-2xl tracking-tight text-slate-900 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                SokoDesk
            </h1>
            <div className="hidden md:flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setActiveTab('chat')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'chat' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Inbox</button>
                {user?.role === 'admin' && (
                    <button onClick={() => setActiveTab('admin')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Team</button>
                )}
            </div>
        </div>
        
        <div className="flex items-center gap-3 md:gap-4">
            <div className="hidden md:flex flex-col items-end mr-2">
                <span className="text-sm font-bold text-slate-800">{user?.name}</span>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{user?.role}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 text-white flex items-center justify-center font-bold shadow-sm">
                {user?.name?.charAt(0).toUpperCase()}
            </div>
            <button onClick={logOutUser} className="hidden md:block text-slate-500 hover:text-red-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            </button>
            {/* Mobile Menu Toggle */}
            <div className="md:hidden flex gap-2">
                {user?.role === 'admin' && (
                    <button onClick={() => setActiveTab(activeTab === 'chat' ? 'admin' : 'chat')} className="p-2 text-slate-600 bg-slate-100 rounded-md">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                    </button>
                )}
            </div>
        </div>
      </div>

      {activeTab === 'admin' && user?.role === 'admin' ? (
          /* ================= ADMIN VIEW (Mobile Responsive) ================= */
          <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col md:flex-row gap-6 items-start bg-slate-50/50">
              <div className="w-full md:w-1/3 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold mb-5 text-slate-800">Add Team Member</h2>
                  {adminStatus.msg && (
                      <div className={`p-3 rounded-xl mb-4 text-sm font-medium ${adminStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{adminStatus.msg}</div>
                  )}
                  <form onSubmit={handleCreateAgent} className="space-y-4">
                      <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Full Name</label><input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm" /></div>
                      <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</label><input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm" /></div>
                      <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Password</label><input type="password" required value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm" /></div>
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Role</label>
                          <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm bg-white">
                              <option value="agent">Support Agent</option>
                              <option value="admin">Administrator</option>
                          </select>
                      </div>
                      <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white font-semibold py-3 rounded-xl mt-4 transition-all shadow-md hover:shadow-lg text-sm">Create Account</button>
                  </form>
              </div>

              <div className="w-full md:w-2/3 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h2 className="text-lg font-bold mb-5 text-slate-800">Team Directory</h2>
                  <div className="grid gap-3">
                      {team.map((member) => (
                          <div key={member._id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors gap-4">
                              <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm">
                                      {member.name.charAt(0)}
                                  </div>
                                  <div>
                                      <p className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                          {member.name} 
                                          <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-200 text-slate-600">{member.role}</span>
                                      </p>
                                      <p className="text-xs text-slate-500 mt-0.5">{member.email}</p>
                                  </div>
                              </div>
                              <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-0 pt-3 sm:pt-0 border-slate-200">
                                  <div className="text-left sm:text-center">
                                      <p className="text-[10px] text-slate-500 uppercase font-bold">Active</p>
                                      <p className="text-base font-black text-slate-800 leading-tight">{member.activeTicketCount || 0}</p>
                                  </div>
                                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-20 text-center ${member.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                                      {member.status}
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      ) : (
          /* ================= CHAT VIEW (Mobile Responsive) ================= */
          <div className="flex-1 flex overflow-hidden">
             
            {/* LEFT SIDEBAR: Queue (Hidden on mobile if chat is open) */}
            <div className={`${isMobileChatOpen ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex-col flex-shrink-0 z-10`}>
                <div className="p-4 bg-white border-b border-slate-100 flex justify-between items-center">
                    <h2 className="font-bold text-slate-800">Support Inbox</h2>
                    <span className="bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-bold">{sessions.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/50">
                {sessions.length === 0 && (
                    <div className="text-center p-8 text-slate-400">
                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                        <p className="text-sm font-medium">Inbox is empty</p>
                    </div>
                )}
                {sessions.map((ticket) => (
                    <div key={ticket._id} onClick={() => handleTicketSelect(ticket)} className={`p-4 rounded-2xl cursor-pointer transition-all border ${activeTicket?._id === ticket._id ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500 ring-opacity-20' : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-slate-900 text-sm truncate pr-2">{ticket.customerName}</span>
                            <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-1 rounded-md flex-shrink-0 ${ticket.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {ticket.status === 'queued' ? 'Waiting' : 'Active'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
                            <span className="truncate">{ticket.originApp}</span>
                        </div>
                    </div>
                ))}
                </div>
            </div>

            {/* RIGHT MAIN AREA: Chat (Hidden on mobile if queue is open) */}
            <div className={`${isMobileChatOpen ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-white relative`}>
                {activeTicket ? (
                <>
                    {/* CHAT HEADER */}
                    <div className="p-3 md:p-4 bg-white border-b border-slate-200 shadow-sm flex justify-between items-center z-10">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setIsMobileChatOpen(false)} className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                            </button>
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            </div>
                            <div>
                                <h2 className="font-bold text-sm md:text-base text-slate-900 leading-tight">{activeTicket.customerName}</h2>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{activeTicket.originApp}</p>
                            </div>
                        </div>
                        <div className="flex gap-2 items-center">
                            {/* WEBRTC CALL BUTTON */}
                            {isCalling && <span className="hidden sm:inline text-xs font-bold text-green-600 mr-2 animate-pulse">{callStatus}</span>}
                            {!isCalling ? (
                                <button onClick={startCall} className="flex items-center justify-center w-9 h-9 md:w-auto md:px-4 md:py-1.5 rounded-full md:rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold transition-all border border-indigo-100">
                                    <svg className="w-4 h-4 md:mr-1.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"></path></svg>
                                    <span className="hidden md:inline text-sm">Call</span>
                                </button>
                            ) : (
                                <button onClick={() => { socketRef.current.emit('end_call', activeTicket._id); stopCall(); }} className="flex items-center justify-center w-9 h-9 md:w-auto md:px-4 md:py-1.5 rounded-full md:rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold transition-all shadow-sm">
                                    <svg className="w-4 h-4 md:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"></path></svg>
                                    <span className="hidden md:inline text-sm">End</span>
                                </button>
                            )}

                            <button onClick={resolveTicket} className="text-sm bg-slate-900 hover:bg-black px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-white font-medium transition-all shadow-sm">
                                <span className="hidden md:inline">Resolve Ticket</span>
                                <span className="md:hidden">Resolve</span>
                            </button>
                        </div>
                    </div>

                    {/* CHAT HISTORY */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50 flex flex-col gap-4">
                        {messages.length === 0 && (
                            <div className="m-auto text-center text-slate-400 text-sm">No messages yet. Send a greeting!</div>
                        )}
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex flex-col ${msg.senderType === 'agent' ? 'items-end' : 'items-start'}`}>
                                <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] md:max-w-md text-sm shadow-sm ${msg.senderType === 'agent' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'}`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* MESSAGE INPUT */}
                    <div className="p-3 md:p-4 bg-white border-t border-slate-200 flex gap-2 md:gap-3">
                        <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Type your reply..." className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 md:py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm shadow-inner" />
                        <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 text-white font-bold p-2.5 md:px-6 md:py-3 rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center">
                            <svg className="w-5 h-5 md:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                            <span className="hidden md:inline">Send</span>
                        </button>
                    </div>
                </>
                ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-4">
                        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    </div>
                    <p className="text-lg font-semibold text-slate-600">Select a conversation</p>
                    <p className="text-sm mt-1">Choose a ticket from the inbox to start chatting.</p>
                </div>
                )}
            </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;