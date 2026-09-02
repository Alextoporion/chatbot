import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:8080';

const Dashboard = () => {
    const [sessions, setSessions] = useState([]);
    const [activeTicket, setActiveTicket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');

    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        socketRef.current = io(BACKEND_URL);

        const fetchSessions = async () => {
            try {
                const res = await axios.get(`${BACKEND_URL}/api/chat/sessions/queued`);
                if (res.data.success) {
                    setSessions(res.data.data);
                }
            } catch (err) {
                console.error('Failed to fetch sessions', err);
            }
        };

        fetchSessions();

        // UPDATED: Listen for new tickets and refresh automatically
        socketRef.current.on('refresh_queue', () => {
            fetchSessions();
        });

        return () => {
            socketRef.current.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!activeTicket) return;

        const fetchHistory = async () => {
            try {
                const res = await axios.get(`${BACKEND_URL}/api/chat/session/${activeTicket._id}/messages`);
                if (res.data.success) {
                    setMessages(res.data.data);
                }
            } catch (err) {
                console.error('Failed to fetch history', err);
            }
        };

        fetchHistory();
        socketRef.current.emit('join_session', activeTicket._id);

        // Listen for incoming messages for this ticket
        const handleNewMessage = (msg) => {
            // ONLY add it to the screen if it belongs to this ticket AND wasn't sent by us
            if (msg.sessionId === activeTicket._id && msg.senderId !== 'agent_top_orion_01') {
                setMessages((prev) => [...prev, msg]);
            }
        };

        socketRef.current.on('receive_message', handleNewMessage);

        return () => {
            socketRef.current.off('receive_message', handleNewMessage);
        };
    }, [activeTicket]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!inputValue.trim() || !activeTicket) return;

        const msgData = {
            sessionId: activeTicket._id,
            senderType: 'agent',
            senderId: 'agent_top_orion_01',
            content: inputValue
        };

        socketRef.current.emit('send_message', msgData);
        setMessages((prev) => [...prev, msgData]);
        setInputValue('');

        if (activeTicket.status === 'queued') {
            try {
                await axios.patch(`${BACKEND_URL}/api/chat/session/${activeTicket._id}/status`, {
                    status: 'active',
                    agentId: 'agent_top_orion_01',
                    agentName: 'Top Orion Support'
                });

                setActiveTicket((prev) => ({ ...prev, status: 'active' }));
                setSessions((prev) =>
                    prev.map((t) => t._id === activeTicket._id ? { ...t, status: 'active' } : t)
                );
            } catch (err) {
                console.error('Failed to claim ticket', err);
            }
        }
    };

    const resolveTicket = async () => {
        if (!activeTicket) return;

        try {
            await axios.patch(`${BACKEND_URL}/api/chat/session/${activeTicket._id}/status`, {
                status: 'closed'
            });

            socketRef.current.emit('close_session', activeTicket._id);

            setSessions((prev) => prev.filter((t) => t._id !== activeTicket._id));
            setActiveTicket(null);
        } catch (err) {
            console.error('Failed to resolve ticket', err);
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans text-gray-800">

            <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
                <div className="p-4 bg-blue-600 text-white font-bold text-lg shadow-md flex justify-between items-center">
                    <span>Support Queue</span>
                    <span className="bg-blue-800 px-2 py-1 rounded text-sm">{sessions.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                    {sessions.map((ticket) => (
                        <div
                            key={ticket._id}
                            onClick={() => setActiveTicket(ticket)}
                            className={`p-4 rounded-lg shadow-sm border cursor-pointer transition-colors ${activeTicket?._id === ticket._id ? 'border-blue-500 bg-blue-50' : 'bg-white border-gray-200 hover:border-blue-400'}`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-blue-600">{ticket.originApp}</span>
                                <span className={`text-xs px-2 py-1 rounded-full ${ticket.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {ticket.status}
                                </span>
                            </div>
                            <p className="text-sm font-medium">{ticket.customerName}</p>
                            <p className="text-xs text-gray-400 truncate mt-1">ID: {ticket.customerId}</p>
                        </div>
                    ))}
                    {sessions.length === 0 && (
                        <p className="text-center text-gray-500 text-sm mt-10">No tickets in the queue.</p>
                    )}
                </div>
            </div>

            <div className="w-2/3 flex flex-col bg-white">
                {activeTicket ? (
                    <>
                        <div className="p-4 bg-white border-b border-gray-200 shadow-sm flex justify-between items-center z-10">
                            <div>
                                <h2 className="font-bold text-lg">Chatting with {activeTicket.customerName}</h2>
                                <p className="text-xs text-gray-500">Origin: {activeTicket.originApp}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setActiveTicket(null)}
                                    className="text-sm bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded text-gray-700 font-medium transition-colors"
                                >
                                    Hide View
                                </button>
                                <button
                                    onClick={resolveTicket}
                                    className="text-sm bg-green-500 hover:bg-green-600 px-3 py-1 rounded text-white font-medium transition-colors"
                                >
                                    Resolve & Close
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 flex flex-col gap-4">
                            {messages.map((msg, index) => (
                                <div
                                    key={index}
                                    className={`px-4 py-2 rounded-lg max-w-md text-sm ${msg.senderType === 'agent'
                                            ? 'self-end bg-blue-600 text-white'
                                            : 'self-start bg-gray-200 text-gray-800'
                                        }`}
                                >
                                    {msg.content}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="p-4 bg-white border-t border-gray-200 flex gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                placeholder="Type your reply..."
                                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 outline-none focus:border-blue-500"
                            />
                            <button
                                onClick={sendMessage}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                            >
                                Send
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                        <p className="text-lg font-medium">Select a ticket from the queue to start chatting.</p>
                    </div>
                )}
            </div>

        </div>
    );
};

export default Dashboard;