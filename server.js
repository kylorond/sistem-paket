const express = require('express');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const selfsigned = require('selfsigned');

const app = express();
app.use(express.static('public'));

const activeRoles = {
    'Petugas Depan': null,
    'Petugas Belakang': null
};
const PIN_RAHASIA = '73123';

async function startServer() {
    let pems;
    if (fs.existsSync('cert.pem') && fs.existsSync('key.pem')) {
        pems = {
            cert: fs.readFileSync('cert.pem', 'utf8'),
            private: fs.readFileSync('key.pem', 'utf8')
        };
    } else {
        const attrs = [{ name: 'commonName', value: 'sistem-paket.local' }];
        const result = selfsigned.generate(attrs, { days: 3650 });
        pems = result instanceof Promise ? await result : result;
        fs.writeFileSync('cert.pem', pems.cert);
        fs.writeFileSync('key.pem', pems.private);
    }

    const server = https.createServer({
        key: pems.private,
        cert: pems.cert
    }, app);

    const io = socketIo(server);

    const broadcastStatus = () => {
        io.emit('online_status', {
            'Petugas Depan': activeRoles['Petugas Depan'] !== null,
            'Petugas Belakang': activeRoles['Petugas Belakang'] !== null
        });
    };

    io.on('connection', (socket) => {
        socket.on('login_attempt', (data) => {
            const { role, pin } = data;
            
            if (pin !== PIN_RAHASIA) {
                socket.emit('login_error', 'PIN Akses Salah.');
                return;
            }
            
            if (activeRoles[role] !== null && activeRoles[role] !== socket.id) {
                socket.emit('login_error', `STASIUN PENUH: ${role} sudah login di perangkat lain.`);
                return;
            }
            
            for (const r in activeRoles) {
                if (activeRoles[r] === socket.id) {
                    activeRoles[r] = null;
                }
            }
            
            activeRoles[role] = socket.id;
            socket.userRole = role;
            
            socket.emit('login_success', role);
            broadcastStatus();
        });

        socket.on('request_status', () => {
            socket.emit('online_status', {
                'Petugas Depan': activeRoles['Petugas Depan'] !== null,
                'Petugas Belakang': activeRoles['Petugas Belakang'] !== null
            });
        });

        socket.on('logout', () => {
            if (socket.userRole && activeRoles[socket.userRole] === socket.id) {
                activeRoles[socket.userRole] = null;
                socket.userRole = null;
                broadcastStatus();
                socket.broadcast.emit('end_call');
            }
        });

        socket.on('disconnect', () => {
            if (socket.userRole && activeRoles[socket.userRole] === socket.id) {
                activeRoles[socket.userRole] = null;
                socket.userRole = null;
                broadcastStatus();
                socket.broadcast.emit('end_call');
            }
        });

        socket.on('chat_message', (data) => socket.broadcast.emit('chat_message', data));
        socket.on('notification', (data) => socket.broadcast.emit('notification', data));
        socket.on('offer', (data) => socket.broadcast.emit('offer', data));
        socket.on('answer', (data) => socket.broadcast.emit('answer', data));
        socket.on('ice-candidate', (data) => socket.broadcast.emit('ice-candidate', data));
        socket.on('end_call', () => socket.broadcast.emit('end_call'));
    });

    const PORT = 3000;
    server.listen(PORT, '0.0.0.0', () => {});
}

startServer();