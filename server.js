const express = require("express");
const mongoose = require("mongoose");
const fs = require('fs');
const User = require('./models/user');
const Chat = require('./models/chat');
const { v4: uuidv4 } = require('uuid');
require("dotenv").config();
const { createServer } = require("https");
const { Server } = require("socket.io");
const cors = require('cors');
const app = express();
app.use(express.json({limit: '50mb'}));

const options = {};
options.key = fs.readFileSync(process.env.SSL_KEY);
options.cert = fs.readFileSync(process.env.SSL_CERTIFICATE);

const cors_origins =
    [
        "https://localoverino.se:8080"
        ,"https://loverino.se"
        ,"https://www.loverino.se"
    ];
const cors_methods = ['GET','POST','DELETE','UPDATE','PUT','PATCH','OPTIONS'];

const web_cors = {origin: cors_origins,methods: cors_methods};
const io_cors = {origin: cors_origins,methods: ["GET", "POST"]};

app.use(cors(web_cors));

const init = async () => {
    console.log('MONGO_DB:',process.env.MONGO_DB);
    console.log('process.env.PORT:',process.env.PORT);
    try{
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.MONGO_DB);
        app.get("/", (req, res) => {
            res.status(200).json({ alive: "True" });
        });

        const httpServer = createServer(options, app);
        const io = new Server(httpServer, {cors: io_cors});

        io.use(async (socket, next) => {
            if(socket.handshake.headers.tkn){
                try{
                    const access_token = socket.handshake.headers.tkn;
                    console.log("access_token:",access_token);
                    const found = await User.findOne({access_token: access_token});
                    if(found){
                        socket.name = found.name;
                        socket.room = found.room;
                        socket.user_id = found._id.toString();
                        return next();
                    }
                }
                catch(exception){
                    console.log("exception:",exception);
                }
            }
        });

        let all_sockets = [];

        io.on("connection", async (socket) => {
            console.log('socket connection::::',socket.id);
            const ob = {
                id: socket.id,
                room: socket.room,
                name: socket.name,
                user_id: socket.user_id
            };
            console.log("ob",ob);
            console.log('first all_sockets:',all_sockets);
            all_sockets = all_sockets.filter(el => el.user_id !== socket.user_id);
            all_sockets.push(ob);

            console.log('all_sockets:',all_sockets);
            const sockets = await io.fetchSockets();

            sockets.forEach(socket => {
                console.log('socket.user_id:',socket.user_id);
                const found = all_sockets.find(el => el.id === socket.id);
                if(!found){
                    console.log('delete',socket.id);
                    socket.disconnect();
                }
            });
            console.log('all_sockets again:',all_sockets);


            socket.on("message", async (data) => {
                const counter_part = await User.findOne({_id: {$ne: socket.user_id}, room: socket.room});
                if(counter_part){
                    const counter_part_id = counter_part._id.toString();
                    const chat_message = {
                        room_id: socket.room,
                        from: socket.user_id,
                        to: counter_part_id,
                        message: data
                    };
                    console.log('chat_message',chat_message);
                    const chat = new Chat(chat_message);
                    const chat_result = await chat.save();
                    console.log('chat_result',chat_result);
                    const recipient = all_sockets.find(el => el.user_id === counter_part_id);
                    if(recipient){
                        console.log('recipient',recipient);
                        io.to(recipient.id).emit('private', data);
                    }
                    else{
                        console.log("recipient not found (not online)!");
                    }
                }
            });

            socket.on("unmatch", (data) => {
                console.log("unmatch - all_sockets",all_sockets);
                console.log("socket.room",socket.room);
                const new_sockets = [];
                all_sockets.forEach(el => {
                    if(el.room === socket.room){
                        console.log("need to remove:",socket.id);
                        io.to(el.id).emit('unmatched', '');
                    }
                    else{
                        new_sockets.push(el);
                    }
                })
                all_sockets = new_sockets;
                console.log("last one:",all_sockets);
            });

            socket.on("disconnect", (reason) => {
                console.log("socket.id disconnecting:",socket.id);
                all_sockets = all_sockets.filter(el => el.id !== socket.id);
                console.log("all_sockets",all_sockets);
            });
        });

        httpServer.listen(process.env.PORT, () => {
            console.log(`Chat app listening on port ${process.env.PORT}`);
        });
    }
    catch(exception){
        console.log('Server could not start due to db error');
        console.log('exception:',exception);
        process.exit(1);
    }
}

init().catch(console.log);
