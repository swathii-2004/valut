// src/socket.js — shared Socket.io instance
// Avoids circular dependency between server.js and routes
let _io = null;

module.exports = {
    setIo(io) { _io = io; },
    getIo() { return _io; },
};
