(function () {
    const BACKEND_URL = "http://localhost:8080";

    const currentScript = document.currentScript || document.querySelector('script[src*="widget.js"]');
    const appId = currentScript ? (currentScript.getAttribute('data-app-id') || 'UNKNOWN_APP') : 'UNKNOWN_APP';

    const socketScript = document.createElement('script');
    socketScript.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    document.head.appendChild(socketScript);

    socketScript.onload = async () => {
        let customerId = localStorage.getItem('saas_customer_id');
        if (!customerId) {
            customerId = 'cust_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('saas_customer_id', customerId);
        }

        const widgetContainer = document.createElement('div');
        widgetContainer.innerHTML = `
            <div id="saas-chat-window" style="display: none; position: fixed; bottom: 80px; right: 20px; width: 350px; height: 500px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.2); font-family: sans-serif; z-index: 999999; flex-direction: column; overflow: hidden;">
                
                <div style="background: #2563eb; color: white; padding: 16px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                    <span>Live Support</span>
                    <div>
                        <span id="saas-close-chat" style="cursor: pointer; font-size: 18px;">✖</span>
                    </div>
                </div>

                <!-- 📞 NEW: Incoming Call Banner (Hidden by default) -->
                <div id="saas-call-banner" style="display: none; background: #10b981; color: white; padding: 12px; justify-content: space-between; align-items: center; font-size: 14px;">
                    <span id="saas-call-status">Agent is calling...</span>
                    <div>
                        <button id="saas-answer-call" style="background: white; color: #10b981; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 5px;">Answer</button>
                        <button id="saas-end-call" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">End</button>
                    </div>
                </div>

                <!-- 🎵 NEW: Invisible Audio Player -->
                <audio id="saas-remote-audio" autoplay></audio>

                <div id="saas-chat-messages" style="flex: 1; padding: 16px; overflow-y: auto; background: #f3f4f6; display: flex; flex-direction: column; gap: 12px;"></div>
                
                <div style="padding: 12px; background: white; border-top: 1px solid #e5e7eb; display: flex; gap: 8px;">
                    <input type="text" id="saas-chat-input" placeholder="Type a message..." style="flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; outline: none; font-size: 14px;">
                    <button id="saas-chat-send" style="background: #2563eb; color: white; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">Send</button>
                </div>
            </div>
            <div id="saas-chat-launcher" style="position: fixed; bottom: 20px; right: 20px; background: #2563eb; color: white; padding: 12px 24px; border-radius: 50px; font-family: sans-serif; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 999999;">
                Chat with Support
            </div>
        `;
        document.body.appendChild(widgetContainer);

        const launcher = document.getElementById('saas-chat-launcher');
        const chatWindow = document.getElementById('saas-chat-window');
        const closeBtn = document.getElementById('saas-close-chat');
        const sendBtn = document.getElementById('saas-chat-send');
        const inputField = document.getElementById('saas-chat-input');
        const messagesArea = document.getElementById('saas-chat-messages');

        // NEW: WebRTC UI Elements
        const callBanner = document.getElementById('saas-call-banner');
        const answerBtn = document.getElementById('saas-answer-call');
        const endCallBtn = document.getElementById('saas-end-call');
        const remoteAudio = document.getElementById('saas-remote-audio');
        const callStatus = document.getElementById('saas-call-status');

        launcher.addEventListener('click', () => { chatWindow.style.display = 'flex'; launcher.style.display = 'none'; });
        closeBtn.addEventListener('click', () => { chatWindow.style.display = 'none'; launcher.style.display = 'block'; });

        const appendMessage = (text, isSender) => {
            const msgDiv = document.createElement('div');
            msgDiv.style.cssText = isSender
                ? "background: #2563eb; color: white; padding: 10px 14px; border-radius: 12px; max-width: 80%; align-self: flex-end; font-size: 14px;"
                : "background: #e5e7eb; padding: 10px 14px; border-radius: 12px; max-width: 80%; align-self: flex-start; font-size: 14px; color: #1f2937;";
            msgDiv.innerText = text;
            messagesArea.appendChild(msgDiv);
            messagesArea.scrollTop = messagesArea.scrollHeight;
        };

        const socket = io(BACKEND_URL);
        let currentSessionId = localStorage.getItem(`saas_session_${appId}`);

        if (currentSessionId) {
            chatWindow.style.display = 'flex';
            launcher.style.display = 'none';

            socket.emit('join_session', currentSessionId);

            try {
                const res = await fetch(`${BACKEND_URL}/api/chat/session/${currentSessionId}/messages`);
                const data = await res.json();

                if (data.success) {
                    data.data.forEach(msg => {
                        appendMessage(msg.content, msg.senderType === 'customer');
                    });
                }
            } catch (err) {
                console.error("Failed to load old messages");
            }
        }

        sendBtn.addEventListener('click', async () => {
            const text = inputField.value.trim();
            if (!text) return;

            appendMessage(text, true);
            inputField.value = '';

            if (!currentSessionId) {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/chat/session`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            companyId: appId,
                            originApp: window.location.hostname || 'Unknown Website',
                            customerId: customerId,
                            customerName: 'Guest User',
                            customerEmail: 'guest@example.com'
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        currentSessionId = data.data._id;
                        localStorage.setItem(`saas_session_${appId}`, currentSessionId);

                        socket.emit('join_session', currentSessionId);
                        socket.emit('new_ticket_created');
                    }
                } catch (err) {
                    console.error('Failed to create session');
                    return;
                }
            }

            socket.emit('send_message', {
                sessionId: currentSessionId,
                senderType: 'customer',
                senderId: customerId,
                content: text
            });
        });

        socket.on('receive_message', (msg) => {
            if (msg.senderId !== customerId) {
                appendMessage(msg.content, false);
            }
        });

        socket.on('session_closed', () => {
            appendMessage("An agent has closed this chat. Type below to start a new session.", false);
            localStorage.removeItem(`saas_session_${appId}`);
            currentSessionId = null; // Clears the memory so the next message creates a new ticket!

            // FIX: Keep the input active and change the placeholder!
            inputField.disabled = false;
            sendBtn.disabled = false;
            inputField.placeholder = "Type a message to start a new chat...";
        });

        // ==========================================
        // 📞 WEBRTC AUDIO CALL LOGIC
        // ==========================================

        const rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        let peerConnection = null;
        let localStream = null;
        let pendingOffer = null;

        // 1. Agent rings the widget
        socket.on('incoming_call', (data) => {
            pendingOffer = data.offer;
            callBanner.style.display = 'flex';
            callStatus.innerText = "Agent is calling...";
            answerBtn.style.display = 'block';
            chatWindow.style.display = 'flex'; // Auto-open widget if closed
            launcher.style.display = 'none';
        });

        // 2. Customer clicks "Answer"
        answerBtn.addEventListener('click', async () => {
            try {
                answerBtn.style.display = 'none';
                callStatus.innerText = "Connecting...";

                // Ask for microphone
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

                peerConnection = new RTCPeerConnection(rtcConfig);

                // Add microphone audio to connection
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

                // Play agent's audio when received
                peerConnection.ontrack = (event) => {
                    remoteAudio.srcObject = event.streams[0];
                    callStatus.innerText = "Call Active 🎙️";
                };

                // Send ICE coordinates back to Agent
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.emit('ice_candidate', { sessionId: currentSessionId, candidate: event.candidate });
                    }
                };

                // Accept the Agent's offer
                await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));

                // Create Answer and send to Agent
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                socket.emit('answer_call', {
                    sessionId: currentSessionId,
                    answer: answer
                });

            } catch (error) {
                console.error("Mic error:", error);
                callStatus.innerText = "Microphone denied!";
                setTimeout(() => callBanner.style.display = 'none', 3000);
            }
        });

        // 3. Receive ICE coordinates from Agent
        socket.on('ice_candidate', async (data) => {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        // 4. Hang up the call
        const stopCall = () => {
            if (peerConnection) peerConnection.close();
            if (localStream) localStream.getTracks().forEach(track => track.stop());
            callBanner.style.display = 'none';
            peerConnection = null;
            localStream = null;
        };

        // When Customer clicks "End"
        endCallBtn.addEventListener('click', () => {
            socket.emit('end_call', currentSessionId);
            stopCall();
        });

        // When Agent hangs up
        socket.on('call_ended', () => {
            stopCall();
        });

    };
})();