const socket = io();
let currentUserRole = '';
let partnerRole = '';
let audioCtx;
let iceCandidateQueue = [];

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const roleSelect = document.getElementById('role-select');
const passwordInput = document.getElementById('password-input');
const roleDisplay = document.getElementById('user-role-display');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const actionGridContainer = document.getElementById('action-grid-container');
const voiceStatus = document.getElementById('voice-status-text');
const btnStartCall = document.getElementById('btn-start-call');
const btnSendChat = document.getElementById('btn-send-chat');
const partnerDot = document.getElementById('partner-dot');
const partnerText = document.getElementById('partner-text');

let lastDate = new Date().getDate();

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
    window.speechSynthesis.getVoices();
}

function unlockAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.value = 0;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.01);
    
    const remoteAudio = document.getElementById('remote-audio');
    if (remoteAudio) {
        remoteAudio.play().catch(() => {});
    }
}

socket.on('connect', () => {
    if (currentUserRole !== '') {
        socket.emit('login_attempt', { role: currentUserRole, pin: PIN_RAHASIA });
    }
});

setInterval(() => {
    const now = new Date();
    document.getElementById('clock').innerText = now.toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute:'2-digit' });
    
    if (now.getDate() !== lastDate) {
        lastDate = now.getDate();
        chatBox.innerHTML = '';
        appendChat('Sistem', 'Riwayat obrolan dibersihkan otomatis.', true, true);
    }
    
    if (currentUserRole !== '') {
        socket.emit('request_status');
    }
}, 3000);

function getTime() {
    return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function login() {
    unlockAudio();
    const role = roleSelect.value;
    const pin = passwordInput.value;
    socket.emit('login_attempt', { role, pin });
}

socket.on('login_success', (role) => {
    currentUserRole = role;
    partnerRole = currentUserRole === 'Petugas Depan' ? 'Petugas Belakang' : 'Petugas Depan';
    roleDisplay.innerText = currentUserRole;
    loginScreen.classList.remove('active');
    appScreen.classList.add('active');
    
    setupActionButtons();
    socket.emit('request_status');
});

function setupActionButtons() {
    actionGridContainer.innerHTML = '';
    if (currentUserRole === 'Petugas Depan') {
        actionGridContainer.innerHTML = `
            <button id="btn-panggil" class="action-card dispatch" onclick="sendNotification('PANGGIL')" disabled>
                <div class="action-icon"><i class="fas fa-bell"></i></div>
                <div class="action-info">
                    <h4>Panggil Belakang</h4>
                    <p>Permisi, ada pengambilan paket.</p>
                </div>
            </button>
        `;
    } else {
        actionGridContainer.innerHTML = `
            <button id="btn-ambil" class="action-card ready" onclick="sendNotification('AMBIL')" disabled>
                <div class="action-icon"><i class="fas fa-box-open"></i></div>
                <div class="action-info">
                    <h4>Paket Siap</h4>
                    <p>Paket siap untuk diambil.</p>
                </div>
            </button>
            <button id="btn-belum" class="action-card not-ready" onclick="sendNotification('BELUM')" disabled>
                <div class="action-icon"><i class="fas fa-box"></i></div>
                <div class="action-info">
                    <h4>Paket Belum Siap</h4>
                    <p>Paket belum siap untuk diambil.</p>
                </div>
            </button>
        `;
    }
}

socket.on('login_error', (msg) => {
    document.getElementById('login-error').innerText = msg;
    if (appScreen.classList.contains('active')) {
        currentUserRole = '';
        location.reload();
    }
});

socket.on('online_status', (statusData) => {
    if (!currentUserRole) return;
    const isPartnerOnline = statusData[partnerRole];
    
    const btnPanggil = document.getElementById('btn-panggil');
    const btnAmbil = document.getElementById('btn-ambil');
    const btnBelum = document.getElementById('btn-belum');

    if (isPartnerOnline) {
        partnerDot.className = 'status-dot online';
        partnerText.innerText = 'Mitra Online';
        btnStartCall.disabled = false;
        chatInput.disabled = false;
        btnSendChat.disabled = false;
        if (btnPanggil) btnPanggil.disabled = false;
        if (btnAmbil) btnAmbil.disabled = false;
        if (btnBelum) btnBelum.disabled = false;
    } else {
        partnerDot.className = 'status-dot offline';
        partnerText.innerText = 'Mitra Offline';
        btnStartCall.disabled = true;
        chatInput.disabled = true;
        btnSendChat.disabled = true;
        if (btnPanggil) btnPanggil.disabled = true;
        if (btnAmbil) btnAmbil.disabled = true;
        if (btnBelum) btnBelum.disabled = true;
        
        if (peerConnection) {
            endCall(true);
        }
    }
});

function logout() { 
    socket.emit('logout');
    setTimeout(() => {
        location.reload();
    }, 100);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function speakText(textToSpeak) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = 'id-ID';
        
        const voices = window.speechSynthesis.getVoices();
        const idVoices = voices.filter(v => v.lang.includes('id'));
        
        const selectedVoice = idVoices.find(v => v.name.includes('Google') || v.name.includes('Online')) || 
                              idVoices.find(v => v.name.includes('Gadis')) || 
                              idVoices.find(v => !v.localService) || 
                              idVoices[0];

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        utterance.rate = 0.95; 
        utterance.pitch = 1.15; 
        
        window.speechSynthesis.speak(utterance);
    }
}

function playChatNotification() {
    if (!audioCtx) unlockAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const now = audioCtx.currentTime;
    
    function playNote(freq, startTime) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.9, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        
        osc.start(startTime);
        osc.stop(startTime + 0.45);
    }
    
    playNote(987.77, now);
    playNote(1318.51, now + 0.12);
}

function playPleasantNotificationSound(spokenText) {
    if (!audioCtx) unlockAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    function playTone(freq, startTime, duration) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.6, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
    }
    const now = audioCtx.currentTime;
    playTone(587.33, now, 1.0);       
    playTone(739.99, now + 0.15, 1.0);
    playTone(880.00, now + 0.3, 1.5); 
    playTone(1174.66, now + 0.45, 2.0);

    if (spokenText) {
        setTimeout(() => {
            speakText(spokenText);
        }, 1200);
    }
}

function playPhoneRingtone() {
    if (!audioCtx) unlockAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    function playMarimbaTone(freq, startTime) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.7, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);
        osc.start(startTime);
        osc.stop(startTime + 0.8);
    }
    const now = audioCtx.currentTime;
    playMarimbaTone(880.00, now);
    playMarimbaTone(659.25, now + 0.25);
    playMarimbaTone(880.00, now + 1.2);
    playMarimbaTone(659.25, now + 1.45);
}

function sendNotification(jenis) {
    let textMessage = '';
    if (jenis === 'PANGGIL') textMessage = 'Permisi, Ada Pengambilan Paket';
    else if (jenis === 'AMBIL') textMessage = 'Paket Siap untuk diambil';
    else if (jenis === 'BELUM') textMessage = 'Paket belum siap untuk diambil';

    socket.emit('notification', { sender: currentUserRole, type: jenis, text: textMessage });
    appendChat('Sistem', textMessage, true, true);
    showToast('Pemberitahuan berhasil dikirim.', 'success');
}

socket.on('notification', (data) => {
    playPleasantNotificationSound(data.text);
    if (data.type === 'PANGGIL') {
        showToast('Permisi, Ada Pengambilan Paket', 'info');
        appendChat('Petugas Depan', data.text, false, false);
    } else if (data.type === 'AMBIL') {
        showToast('Paket Siap untuk diambil', 'success');
        appendChat('Petugas Belakang', data.text, false, false);
    } else if (data.type === 'BELUM') {
        showToast('Paket belum siap untuk diambil', 'info');
        appendChat('Petugas Belakang', data.text, false, false);
    }
});

function sendMessage() {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('chat_message', { sender: currentUserRole, text: msg });
        appendChat('Anda', msg, true);
        chatInput.value = '';
    }
}

function handleEnter(e) { if (e.key === 'Enter') sendMessage(); }

socket.on('chat_message', (data) => { 
    playChatNotification();
    appendChat(data.sender, data.text, false); 
});

function appendChat(sender, text, isMe, isSystem = false) {
    const div = document.createElement('div');
    if (isSystem) {
        div.className = 'chat-bubble system';
        div.innerHTML = `${text}`;
    } else {
        div.className = `chat-bubble ${isMe ? 'me' : 'other'}`;
        div.innerHTML = `<strong>${sender}</strong> ${text} <span class="time">${getTime()}</span>`;
    }
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

let localStream;
let peerConnection;
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startCall() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Sistem memblokir Mikrofon.", 'info');
        return;
    }
    try {
        iceCandidateQueue = [];
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        peerConnection = new RTCPeerConnection(config);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => { 
            const remoteAudio = document.getElementById('remote-audio');
            remoteAudio.srcObject = event.streams[0]; 
            remoteAudio.play().catch(()=>{});
        };
        peerConnection.onicecandidate = (event) => { if (event.candidate) socket.emit('ice-candidate', event.candidate); };
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
        toggleVoiceUI(true, 'Menghubungkan...');
        appendChat('Sistem Audio', 'Menginisiasi panggilan.', true, true);
    } catch (err) {
        showToast("Izin mikrofon ditolak.", 'info');
    }
}

function endCall(isRemote = false) {
    iceCandidateQueue = [];
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    peerConnection = null;
    toggleVoiceUI(false, 'Siap Dihubungkan');
    if (!isRemote) {
        socket.emit('end_call');
        appendChat('Sistem Audio', 'Anda mengakhiri panggilan.', true, true);
    } else {
        appendChat('Sistem Audio', 'Panggilan diakhiri.', false, true);
    }
}

socket.on('end_call', () => { endCall(true); });

function toggleVoiceUI(isCalling, statusText) {
    const btnEnd = document.getElementById('btn-end-call');
    voiceStatus.innerText = statusText;
    if (isCalling) {
        btnStartCall.classList.add('hidden');
        btnEnd.classList.remove('hidden');
        voiceStatus.classList.add('active');
    } else {
        btnStartCall.classList.remove('hidden');
        btnEnd.classList.add('hidden');
        voiceStatus.classList.remove('active');
    }
}

socket.on('offer', async (offer) => {
    playPhoneRingtone();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Panggilan masuk ditolak. Mikrofon diblokir.", 'info');
        return;
    }
    try {
        if(!peerConnection) {
            iceCandidateQueue = [];
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            peerConnection = new RTCPeerConnection(config);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            peerConnection.ontrack = (event) => { 
                const remoteAudio = document.getElementById('remote-audio');
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.play().catch(()=>{});
            };
            peerConnection.onicecandidate = (event) => { if (event.candidate) socket.emit('ice-candidate', event.candidate); };
            toggleVoiceUI(true, 'Terhubung');
        }
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
        
        while(iceCandidateQueue.length) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidateQueue.shift()));
        }
    } catch (err) {
        showToast("Panggilan terputus. Izin mikrofon ditolak.", 'info');
    }
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    voiceStatus.innerText = 'Terhubung';
    
    while(iceCandidateQueue.length) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidateQueue.shift()));
    }
});

socket.on('ice-candidate', async (candidate) => {
    try { 
        if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); 
        } else {
            iceCandidateQueue.push(candidate);
        }
    } catch(e) {}
});
