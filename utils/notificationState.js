// Shared module-level flag — tracks whether the user is on the chat screen.
// Used by the notification handler in _layout.js to suppress foreground alerts
// when the user is already reading the chat.
let _chatScreenActive = false;

export const setIsChatActive = (val) => {
    _chatScreenActive = val;
};

export const getIsChatActive = () => _chatScreenActive;
