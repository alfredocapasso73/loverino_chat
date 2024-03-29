const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChatSchema = new Schema({
    room_id: {
        type: String
    },
    from: {
        type: mongoose.Types.ObjectId
    },
    to: {
        type: mongoose.Types.ObjectId
    },
    message: {
        type: String,
    },
    read_at: {
        type: Date
        ,default: null
    },
}, { timestamps: true });

module.exports = mongoose.model('Chat', ChatSchema);