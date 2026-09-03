import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import UseAuth from '../hooks/UseAuth';
import UseAxiosSecure from '../hooks/UseAxiosSecure';

const BACKEND_URL = 'http://localhost:8080';

const Dashboard = () => {
  const { user, logOutUser } = UseAuth();
  const axiosSecure = UseAxiosSecure();

  const [activeTab, setActiveTab] = useState('chat');
  const [sessions, setSessions] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  // Admin States
  const [team, setTeam] = useState([]);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'agent' });
  const [adminStatus, setAdminStatus] = useState({ type: '', msg: '' });

  // WebRTC States
  const [isCalling, setIsCalling] = useState(false);
  const [callStatus, setCallStatus] = useState('');

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // WebRTC Refs
  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const rtcConfig = {
      iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
      ]
  };

  // --- Alert Helper Function ---
  const playAlert = () => {
    try {
      const audio = new Audio('/alert.mp3');
      audio.play();
      
      const originalTitle = document.title;
      document.title = "(1) New Message! - Command Center";
      
      setTimeout(() => {
        document.title = originalTitle;
      }, 4000);
    } catch (err) {
      console.error("Audio playback failed (browser auto-play policy):", err);
    }
  };
  // -----------------------------

  // 1. Initialize Socket & Fetch Queue
  useEffect(() => {
    if (!user?.id) return; 

    socketRef.current = io(BACKEND_URL, {
      auth: { agentId: user.id }
    });

    const fetchSessions = async () => {
      try {
        const res = await axiosSecure.get(`/chat/sessions/queued`);
        if (res.data.success) setSessions(res.data.data);
      } catch (err) {
        console.error('Failed to fetch sessions', err);
      }
    };
    
    fetchSessions();
    
    socketRef.current.on('refresh_queue', () => {
      fetchSessions();
      playAlert(); 
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user?.id]); 

  // 2. Ticket History & Messaging Hooks
  useEffect(() => {
    if (!activeTicket?._id) return; 

    const fetchHistory = async () => {
      try {
        const res = await axiosSecure.get(`/chat/session/${activeTicket._id}/messages`);
        if (res.data.success) setMessages(res.data.data);
      } catch (err) {
        console.error('Failed to fetch history', err);
      }
    };

    fetchHistory();
    socketRef.current.emit('join_session', activeTicket._id);

    const handleNewMessage = (msg) => {
      if (msg.sessionId === activeTicket._id && msg.senderId !== user?.id) {
        setMessages((prev) => [...prev, msg]);
        playAlert(); 
      }
    };

    // --- WEBRTC SOCKET LISTENERS ---
    const handleAnswer = async (data) => {
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            setCallStatus('Call Active 🎙️');
        }
    };

    const handleIceCandidate = async (data) => {
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    };

    const handleCallEnded = () => {
        stopCall();
    };

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

  // 3. Auto-Scroll to Bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 4. Send Message
  const sendMessage = async () => {
    if (!inputValue.trim() || !activeTicket) return;

    const msgData = {
      sessionId: activeTicket._id,
      senderType: 'agent',
      senderId: user.id,
      content: inputValue
    };

    socketRef.current.emit('send_message', msgData);
    setMessages((prev) => [...prev, msgData]);
    setInputValue('');

    if (activeTicket.status === 'queued') {
      try {
        await axiosSecure.patch(`/chat/session/${activeTicket._id}/status`, {
          status: 'active',
          agentId: user.id,
          agentName: user.name
        });
        
        setActiveTicket((prev) => ({ ...prev, status: 'active' }));
        setSessions((prev) => prev.map((t) => t._id === activeTicket._id ? { ...t, status: 'active' } : t));
      } catch (err) {
        console.error('Failed to claim ticket', err);
      }
    }
  };

  // --- WEBRTC AUDIO CALL FUNCTIONS ---
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
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
          setIsCalling(true);
          setCallStatus('Ringing...');

          const pc = new RTCPeerConnection(rtcConfig);
          peerConnectionRef.current = pc;

          stream.getTracks().forEach(track => pc.addTrack(track, stream));

          pc.ontrack = (event) => {
              if (remoteAudioRef.current) {
                  remoteAudioRef.current.srcObject = event.streams[0];
              }
          };

          pc.onicecandidate = (event) => {
              if (event.candidate) {
                  socketRef.current.emit('ice_candidate', { sessionId: activeTicket._id, candidate: event.candidate });
              }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socketRef.current.emit('call_user', {
              sessionId: activeTicket._id,
              offer: offer
          });

      } catch (error) {
          console.error("Microphone error:", error);
          alert("Please allow microphone access to make a call.");
          stopCall();
      }
  };

  // 5. Resolve Ticket
  const resolveTicket = async () => {
    if (!activeTicket) return;
    try {
      stopCall(); // Make sure to hang up if active!
      await axiosSecure.patch(`/chat/session/${activeTicket._id}/status`, { status: 'closed' });
      socketRef.current.emit('close_session', activeTicket._id);
      setSessions((prev) => prev.filter((t) => t._id !== activeTicket._id));
      setActiveTicket(null);
    } catch (err) {
      console.error('Failed to resolve ticket', err);
    }
  };

  // 6. Create Agent & Auto-Refresh Team List
  const handleCreateAgent = async (e) => {
    e.preventDefault();
    setAdminStatus({ type: '', msg: '' });

    try {
        const res = await axiosSecure.post('/auth/register', formData);
        if (res.data.success) {
            setAdminStatus({ type: 'success', msg: `${formData.name} added successfully!` });
            setFormData({ name: '', email: '', password: '', role: 'agent' });
            
            // Refresh the team list immediately
            const teamRes = await axiosSecure.get('/auth/agents');
            if (teamRes.data.success) setTeam(teamRes.data.data);
        }
    } catch (err) {
        setAdminStatus({ type: 'error', msg: err.response?.data?.message || 'Failed to create team member.' });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans text-gray-800">
      
      {/* 🎵 INVISIBLE AUDIO PLAYER FOR WEBRTC */}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* TOP NAVIGATION BAR */}
      <div className="bg-gray-900 text-white flex justify-between items-center px-6 py-3 shadow-md z-20">
        <div className="flex items-center gap-6">
            <h1 className="font-bold text-xl tracking-wide">Command Center</h1>
            <div className="flex gap-2">
                <button onClick={() => setActiveTab('chat')} className={`px-4 py-1 rounded transition-colors ${activeTab === 'chat' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>Live Chat</button>
                {user?.role === 'admin' && (
                    <button onClick={() => setActiveTab('admin')} className={`px-4 py-1 rounded transition-colors ${activeTab === 'admin' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>Team Management</button>
                )}
            </div>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="text-sm text-gray-300">
                Logged in as <span className="font-bold text-white">{user?.name}</span> 
                <span className="ml-2 px-2 py-0.5 bg-gray-700 rounded text-xs uppercase">{user?.role}</span>
            </div>
            <button onClick={logOutUser} className="bg-red-600 hover:bg-red-700 px-4 py-1 rounded font-medium transition-colors text-sm">Logout</button>
        </div>
      </div>

      {activeTab === 'admin' && user?.role === 'admin' ? (
          /* ================= ADMIN VIEW ================= */
          <div className="flex-1 overflow-y-auto p-10 flex gap-8 items-start bg-gray-50">
              {/* Left Column: Form */}
              <div className="w-1/3 bg-white p-8 rounded-lg shadow-md border border-gray-200 sticky top-0">
                  <h2 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">Add Team Member</h2>
                  {adminStatus.msg && (
                      <div className={`p-3 rounded mb-4 text-sm font-medium ${adminStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{adminStatus.msg}</div>
                  )}
                  <form onSubmit={handleCreateAgent} className="space-y-4">
                      <div><label className="block text-sm font-medium mb-1">Full Name</label><input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-500" /></div>
                      <div><label className="block text-sm font-medium mb-1">Email Address</label><input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-500" /></div>
                      <div><label className="block text-sm font-medium mb-1">Password</label><input type="password" required value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-500" /></div>
                      <div>
                          <label className="block text-sm font-medium mb-1">Account Role</label>
                          <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-500 bg-white">
                              <option value="agent">Support Agent (Chat Only)</option>
                              <option value="admin">Administrator (Full Access)</option>
                          </select>
                      </div>
                      <button type="submit" className="w-full bg-gray-900 hover:bg-black text-white font-bold py-2 rounded mt-2 transition-colors">Create Account</button>
                  </form>
              </div>

              {/* Right Column: Team Directory */}
              <div className="w-2/3 bg-white p-8 rounded-lg shadow-md border border-gray-200">
                  <h2 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">Team Directory</h2>
                  <div className="grid gap-4">
                      {team.map((member) => (
                          <div key={member._id} className="flex justify-between items-center p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                              <div>
                                  <p className="font-bold text-gray-900 text-lg">
                                      {member.name} 
                                      <span className="ml-3 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-gray-200 text-gray-700">{member.role}</span>
                                  </p>
                                  <p className="text-sm text-gray-500 mt-1">{member.email}</p>
                              </div>
                              <div className="flex items-center gap-6">
                                  <div className="text-center">
                                      <p className="text-xs text-gray-500 uppercase font-bold">Active Tickets</p>
                                      <p className="text-lg font-black text-gray-800">{member.activeTicketCount || 0}</p>
                                  </div>
                                  <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide w-24 text-center ${member.status === 'online' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-200 text-gray-500 border border-gray-300'}`}>
                                      {member.status}
                                  </div>
                              </div>
                          </div>
                      ))}
                      {team.length === 0 && <p className="text-gray-500 text-sm">No team members found.</p>}
                  </div>
              </div>
          </div>
      ) : (
          /* ================= CHAT VIEW ================= */
          <div className="flex-1 flex overflow-hidden">
             {/* Left Sidebar Queue */}
            <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-700 flex justify-between items-center">
                <span>Support Queue</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">{sessions.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-100">
                {sessions.map((ticket) => (
                    <div key={ticket._id} onClick={() => setActiveTicket(ticket)} className={`p-4 rounded-lg shadow-sm border cursor-pointer transition-all ${activeTicket?._id === ticket._id ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-blue-800 text-sm">{ticket.originApp}</span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full ${ticket.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{ticket.status}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{ticket.customerName}</p>
                    <p className="text-xs text-gray-400 truncate mt-1">ID: {ticket.customerId}</p>
                    </div>
                ))}
                </div>
            </div>

            {/* Right Main Area */}
            <div className="w-2/3 flex flex-col bg-white">
                {activeTicket ? (
                <>
                    <div className="p-4 bg-white border-b border-gray-200 shadow-sm flex justify-between items-center z-10">
                    <div>
                        <h2 className="font-bold text-lg text-gray-800">Chatting with {activeTicket.customerName}</h2>
                        <p className="text-xs text-gray-500 font-medium">Origin: {activeTicket.originApp}</p>
                    </div>
                    <div className="flex gap-2 items-center">
                        {/* 📞 WEBRTC UI UPDATES */}
                        {isCalling && <span className="text-sm font-bold text-green-600 mr-2">{callStatus}</span>}
                        
                        {!isCalling ? (
                            <button onClick={startCall} className="text-sm bg-purple-100 hover:bg-purple-200 px-3 py-1.5 rounded text-purple-700 font-bold transition-colors border border-purple-200">📞 Call</button>
                        ) : (
                            <button onClick={() => { socketRef.current.emit('end_call', activeTicket._id); stopCall(); }} className="text-sm bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded text-white font-bold transition-colors">End Call</button>
                        )}

                        <button onClick={() => setActiveTicket(null)} className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded text-gray-700 font-medium transition-colors border border-gray-200">Hide View</button>
                        <button onClick={resolveTicket} className="text-sm bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded text-white font-medium transition-colors shadow-sm">Resolve & Close</button>
                    </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-50 flex flex-col gap-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`px-4 py-2 rounded-xl max-w-md text-sm shadow-sm ${msg.senderType === 'agent' ? 'self-end bg-blue-600 text-white rounded-tr-sm' : 'self-start bg-white border border-gray-200 text-gray-800 rounded-tl-sm'}`}>{msg.content}</div>
                    ))}
                    <div ref={messagesEndRef} />
                    </div>
                    <div className="p-4 bg-white border-t border-gray-200 flex gap-2">
                    <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Type your reply..." className="flex-1 border border-gray-300 rounded-lg px-4 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" />
                    <button onClick={sendMessage} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm">Send</button>
                    </div>
                </>
                ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                    <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    <p className="text-lg font-medium text-gray-500">Select a ticket from the queue to start chatting.</p>
                </div>
                )}
            </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;