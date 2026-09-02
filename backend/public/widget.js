(function() {
    const BACKEND_URL = "http://localhost:8080"; // Change this to your live domain later

    // 1. Load Socket.io
    const socketScript = document.createElement('script');
    socketScript.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    document.head.appendChild(socketScript);

    socketScript.onload = async () => {
        const currentScript = document.currentScript || document.querySelector('script[src*="widget.js"]');
        const appId = currentScript.getAttribute('data-app-id') || 'UNKNOWN_APP';
        
        // 2. Generate a random Customer ID and save it in the browser
        let customerId = localStorage.getItem('saas_customer_id');
        if (!customerId) {
            customerId = 'cust_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('saas_customer_id', customerId);
        }

        // 3. Inject the UI
        const widgetContainer = document.createElement('div');
        widgetContainer.innerHTML = `
            <div id="saas-chat-window" style="display: none; position: fixed; bottom: 80px; right: 20px; width: 350px; height: 500px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.2); font-family: sans-serif; z-index: 999999; flex-direction: column; overflow: hidden;">
                <div style="background: #2563eb; color: white; padding: 16px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                    <span>Support (${appId})</span>
                    <span id="saas-close-chat" style="cursor: pointer; font-size: 18px;">✖</span>
                </div>
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

        // 4. UI Elements
        const launcher = document.getElementById('saas-chat-launcher');
        const chatWindow = document.getElementById('saas-chat-window');
        const closeBtn = document.getElementById('saas-close-chat');
        const sendBtn = document.getElementById('saas-chat-send');
        const inputField = document.getElementById('saas-chat-input');
        const messagesArea = document.getElementById('saas-chat-messages');

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

        // 5. Backend Connection Logic
        const socket = io(BACKEND_URL);
        let currentSessionId = localStorage.getItem(`saas_session_${appId}`);

        // If they already have an active chat from a previous page visit, join it immediately
        if (currentSessionId) {
            socket.emit('join_session', currentSessionId);
        }

        // 6. Send and Receive Messages (LAZY SESSION CREATION)
        sendBtn.addEventListener('click', async () => {
            const text = inputField.value.trim();
            if (!text) return; // Do nothing if input is empty

            appendMessage(text, true); // Show message on screen instantly
            inputField.value = '';

            // ONLY create a ticket in the database if they don't have one yet!
            if (!currentSessionId) {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/chat/session`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            originApp: appId,
                            customerId: customerId,
                            customerName: 'Guest User',
                            customerEmail: 'guest@example.com'
                        })
                    });
                    const data = await res.json();
                    if (data.success) {
                        currentSessionId = data.data._id;
                        localStorage.setItem(`saas_session_${appId}`, currentSessionId);
                        
                        // Join the new room and alert the agents
                        socket.emit('join_session', currentSessionId);
                        socket.emit('new_ticket_created');
                    }
                } catch (err) {
                    console.error('Failed to create session', err);
                    return; // Stop if failed
                }
            }

            // Now send the actual message to the database and agent
            socket.emit('send_message', {
                sessionId: currentSessionId,
                senderType: 'customer',
                senderId: customerId,
                content: text
            });
        });

        // Listen for agent replies
        socket.on('receive_message', (msg) => {
            if (msg.senderId !== customerId) { 
                appendMessage(msg.content, false);
            }
        });

        // Listen for the agent closing the chat
        socket.on('session_closed', () => {
            appendMessage("An agent has closed this chat. Refresh the page to start a new session.", false);
            localStorage.removeItem(`saas_session_${appId}`);
            currentSessionId = null; 
            
            inputField.disabled = true;
            sendBtn.disabled = true;
            inputField.placeholder = "Chat ended.";
        });
    };
})();