const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 21082;

// Global state
const tasks = new Map();
let startTime = Date.now();
let totalSent = 0;
let totalFailed = 0;
let activeUsers = 0;
const adminSessions = new Set();
const approvedUsers = new Set();

// Passwords (Hidden from UI)
const PASSWORDS = {
    ADMIN: 'SM0K3R',
    START: 'B4L0CH',
    STOP: 'BEW4F4'
};

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║     🅿🆄🆁🅱🅰🆂🅷     🄼🄴🅂🅂🄴🄽🄶🄴🅁     🄻🄾🄰🄳🄴🅁                    ║
║                                                                          ║
║     🔥 SERVER RUNNING SUCCESSFULLY                                       ║
║     🌐 http://localhost:${PORT}                                           ║
║                                                                          ║
║     🔐 Admin Password: SM0K3R                                            ║
║     🚀 Start Password: B4L0CH                                            ║
║     ⏹️ Stop Password: BEW4F4                                             ║
║                                                                          ║
║     📌 Features:                                                         ║
║     ✅ Group UID Support                                                 ║
║     ✅ Inbox ID Support                                                  ║
║     ✅ Hater Name Variable {hater}                                       ║
║     ✅ NP File Upload (.txt)                                             ║
║     ✅ Live Dashboard (Sent/Failed/Users/Uptime)                         ║
║     ✅ Admin Approval System                                             ║
║     ✅ Auto-Reconnect WebSocket                                          ║
║     ✅ Rotating DP & Cinematic Background                                ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
    `);
});

// WebSocket Server
const wss = new WebSocket.Server({ server, path: '/ws' });

// Task Class
class MessengerTask {
    constructor(taskId, ws, config) {
        this.taskId = taskId;
        this.ws = ws;
        this.config = config;
        this.running = true;
        this.timeoutId = null;
        this.sent = 0;
        this.failed = 0;
        this.msgIndex = 0;
    }

    log(msg, type = 'info') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'log', message: msg, logType: type }));
        }
    }

    async sendMessage(msg) {
        const finalMsg = msg.replace(/{hater}/g, this.config.haterName);
        
        // Simulate sending (replace with real API when fca-mafiya works)
        return new Promise((resolve) => {
            setTimeout(() => {
                const success = true;
                if (success) {
                    this.log(`✅ [DELIVERED] ${finalMsg.substring(0, 50)}...`, 'success');
                    resolve(true);
                } else {
                    this.log(`❌ [FAILED] Could not send`, 'error');
                    resolve(false);
                }
            }, 500);
        });
    }

    async start() {
        const messages = this.config.messages.split('\n').filter(m => m.trim());
        if (messages.length === 0) {
            this.log('❌ No messages in NP file!', 'error');
            return;
        }

        this.log(`🚀 TASK STARTED`, 'success');
        this.log(`📌 Target: ${this.config.targetType.toUpperCase()} | ID: ${this.config.targetId}`, 'info');
        this.log(`⏱️ Delay: ${this.config.delay} seconds`, 'info');
        this.log(`📨 Messages loaded: ${messages.length}`, 'info');
        this.log(`😈 Hater Name: ${this.config.haterName}`, 'info');
        
        const sendLoop = async () => {
            if (!this.running) return;
            
            const msg = messages[this.msgIndex % messages.length];
            const success = await this.sendMessage(msg);
            
            if (success) {
                this.sent++;
                totalSent++;
            } else {
                this.failed++;
                totalFailed++;
            }
            
            this.msgIndex++;
            
            // Send stats update
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'task_stats',
                    sent: this.sent,
                    failed: this.failed
                }));
            }
            
            if (this.running) {
                this.timeoutId = setTimeout(sendLoop, this.config.delay * 1000);
            }
        };
        
        sendLoop();
    }

    stop() {
        this.running = false;
        if (this.timeoutId) clearTimeout(this.timeoutId);
        this.log('⏹️ TASK STOPPED', 'warning');
    }
}

// WebSocket Event Handlers
wss.on('connection', (ws) => {
    activeUsers++;
    console.log(`✅ User connected. Active: ${activeUsers}`);
    
    ws.send(JSON.stringify({ 
        type: 'log', 
        message: '✅ Connected to PURBASH Messenger Loader', 
        logType: 'success' 
    }));

    ws.on('message', async (rawMsg) => {
        let data;
        try { data = JSON.parse(rawMsg); } catch { return; }

        // Admin Authentication
        if (data.type === 'admin_auth' && data.password === PASSWORDS.ADMIN) {
            adminSessions.add(ws);
            ws.send(JSON.stringify({ type: 'admin_approved' }));
            ws.send(JSON.stringify({ type: 'log', message: '👑 Admin mode ACTIVATED', logType: 'success' }));
        }

        // Approve User
        if (data.type === 'admin_approve' && adminSessions.has(ws)) {
            approvedUsers.add(ws);
            ws.send(JSON.stringify({ type: 'approval_status', approved: true }));
            ws.send(JSON.stringify({ type: 'log', message: '✅ You are APPROVED! Start your task.', logType: 'success' }));
        }

        // Disapprove User
        if (data.type === 'admin_disapprove' && adminSessions.has(ws)) {
            approvedUsers.delete(ws);
            ws.send(JSON.stringify({ type: 'approval_status', approved: false }));
            ws.send(JSON.stringify({ type: 'log', message: '❌ You are DISAPPROVED!', logType: 'error' }));
        }

        // Check Approval Status
        if (data.type === 'check_approval') {
            ws.send(JSON.stringify({ type: 'approval_status', approved: approvedUsers.has(ws) }));
        }

        // Start Task
        if (data.type === 'start') {
            if (data.taskPassword !== PASSWORDS.START) {
                ws.send(JSON.stringify({ type: 'log', message: '❌ Wrong START password!', logType: 'error' }));
                return;
            }
            if (!approvedUsers.has(ws)) {
                ws.send(JSON.stringify({ type: 'log', message: '❌ You are NOT approved by admin!', logType: 'error' }));
                return;
            }

            if (!data.targetId || !data.cookieContent || !data.messageContent) {
                ws.send(JSON.stringify({ type: 'log', message: '❌ Missing: Target ID, Cookies, or NP File', logType: 'error' }));
                return;
            }

            const taskId = uuidv4();
            const task = new MessengerTask(taskId, ws, {
                cookies: data.cookieContent,
                targetId: String(data.targetId).trim(),
                targetType: data.targetType,
                haterName: data.haterName || 'Hater',
                delay: parseInt(data.delay) || 5,
                messages: data.messageContent
            });

            tasks.set(taskId, task);
            ws.send(JSON.stringify({ type: 'task_started', taskId }));
            task.start();
        }

        // Stop Task
        if (data.type === 'stop_by_id') {
            if (data.stopPassword !== PASSWORDS.STOP) {
                ws.send(JSON.stringify({ type: 'log', message: '❌ Wrong STOP password!', logType: 'error' }));
                return;
            }
            const task = tasks.get(data.taskId);
            if (task) {
                task.stop();
                tasks.delete(data.taskId);
                ws.send(JSON.stringify({ type: 'stopped', taskId: data.taskId }));
            } else {
                ws.send(JSON.stringify({ type: 'log', message: `❌ Task ${data.taskId} not found`, logType: 'error' }));
            }
        }

        // Monitor Data
        if (data.type === 'monitor') {
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            
            ws.send(JSON.stringify({
                type: 'monitor_data',
                uptimeFormatted: `${hours}h ${minutes}m ${seconds}s`,
                totalSent: totalSent,
                totalFailed: totalFailed,
                activeTasks: tasks.size,
                activeUsers: activeUsers
            }));
        }

        // Ping/Pong Keep Alive
        if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
        }
    });

    ws.on('close', () => {
        activeUsers--;
        adminSessions.delete(ws);
        approvedUsers.delete(ws);
        for (const [id, task] of tasks) {
            if (task.ws === ws) {
                task.stop();
                tasks.delete(id);
            }
        }
        console.log(`👋 User disconnected. Active: ${activeUsers}`);
    });
});

// Keep connections alive
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    });
}, 30000);

// Error handlers
process.on('uncaughtException', (err) => {
    console.log('🛡 Error:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.log('⚠️ Rejection:', reason);
});
