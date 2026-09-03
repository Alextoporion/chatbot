import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:8080';

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1); 
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // --- NEW: Restore Session on Page Load ---
  useEffect(() => {
    const savedSessionId = localStorage.getItem('top_orion_chat_id');
    
    if (savedSessionId) {
      const restoreChat = async () => {
        try {
          // Fetch the old messages
          const res = await axios.get(`${BACKEND_URL}/api/chat/session/${savedSessionId}/messages`);
          
          if (res.data.success) {
            setSession({ _id: savedSessionId }); // Rebuild minimal session state
            setMessages(res.data.data);
            setStep(2); // Skip the form
            initializeSocket(savedSessionId);
          }
        } catch (error) {
          console.error("Could not restore session, starting fresh.");
          localStorage.removeItem('top_orion_chat_id');
        }
      };
      
      restoreChat();
    }
  }, []);
  // -----------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startChat = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${BACKEND_URL}/api/chat/session`, {
        originApp: 'Main Website', 
        customerName: name,
        customerEmail: email,
        customerId: `CUST-${Math.floor(Math.random() * 100000)}` 
      });

      if (res.data.success) {
        const newSessionId = res.data.data._id;
        setSession(res.data.data);
        setStep(2); 
        
        // NEW: Save the ID to browser storage so it survives refresh!
        localStorage.setItem('top_orion_chat_id', newSessionId);
        
        initializeSocket(newSessionId);
      }
    } catch (error) {
      console.error('Failed to start chat session', error);
    }
  };

  const initializeSocket = (sessionId) => {
    socketRef.current = io(BACKEND_URL);
    socketRef.current.emit('join_session', sessionId);
    socketRef.current.emit('new_ticket_created'); 

    socketRef.current.on('receive_message', (msg) => {
      if (msg.senderType === 'agent') {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socketRef.current.on('session_closed', () => {
        setMessages((prev) => [...prev, { senderType: 'system', content: 'The agent has closed this chat.' }]);
        localStorage.removeItem('top_orion_chat_id'); // Clear memory when resolved
        socketRef.current.disconnect();
    });
  };

  const sendMessage = () => {
    if (!message.trim() || !session) return;

    const msgData = {
      sessionId: session._id,
      senderType: 'customer',
      senderId: session.customerId || 'CUST-RESTORED',
      content: message
    };

    socketRef.current.emit('send_message', msgData);
    setMessages((prev) => [...prev, msgData]); 
    setMessage('');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans text-gray-800">
      {!isOpen && (
        <button onClick={() => setIsOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-transform hover:scale-105">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
        </button>
      )}

      {isOpen && (
        <div className="w-80 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[400px]">
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center shadow-md z-10">
            <h3 className="font-bold">Live Support</h3>
            <button onClick={() => setIsOpen(false)} className="text-blue-100 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          {step === 1 ? (
            <div className="flex-1 p-6 flex flex-col justify-center bg-gray-50">
              <p className="text-sm text-gray-600 mb-4 text-center">Please enter your details to start chatting with an agent.</p>
              <form onSubmit={startChat} className="space-y-3">
                <input type="text" required placeholder="Your Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-500 text-sm" />
                <input type="email" required placeholder="Your Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-500 text-sm" />
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded text-sm transition-colors mt-2">Start Chat</button>
              </form>
            </div>
          ) : (
            <>
              <div className="flex-1 p-4 bg-gray-50 overflow-y-auto flex flex-col gap-3">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${msg.senderType === 'system' ? 'self-center bg-gray-200 text-gray-600 text-xs text-center w-full' : msg.senderType === 'customer' ? 'self-end bg-blue-600 text-white rounded-br-sm' : 'self-start bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'}`}>
                    {msg.content}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
                <input type="text" placeholder="Type a message..." value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} className="flex-1 border border-gray-300 rounded px-3 py-1.5 outline-none focus:border-blue-500 text-sm" />
                <button onClick={sendMessage} className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatWidget;