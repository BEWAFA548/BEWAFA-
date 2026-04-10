const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Load fca-mafiya for REAL Facebook messages
let login;
try {
    const fca = require('fca-mafiya');
    login = fca.default;
    console.log('✅ fca-mafiya loaded - REAL Facebook messages will work!');
} catch(e) {
    console.log('❌ fca-mafiya not found! Run: npm install fca-mafiya --force');
    console.log('⚠️ Running in DEMO mode - messages will be simulated');
    login = null;
}

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
║     🔥 ${login ? 'REAL FACEBOOK API LOADED ✅' : 'DEMO MODE ⚠️'}                            ║
║     🌐 http://localhost:${PORT}                                           ║
║                                                                          ║
║     🔐 Admin: SM0K3R | Start: B4L0CH | Stop: BEW4F4                      ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
    `);
});

// WebSocket Server
const wss = new WebSocket.Server({ server, path: '/ws' });

// Real Facebook Messenger Task Class
class RealMessengerTask {
    constructor(taskId, ws, config) {
        this.taskId = taskId;
        this.ws = ws;
        this.config = config;
        this.api = null;
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

    parseCookies(cookieString) {
        const cookies = {};
        cookieString.split(';').forEach(pair => {
            const [key, ...val] = pair.trim().split('=');
            if (key && val.length) cookies[key] = val.join('=');
        });
        
        const appState = [];
        for (const [key, value] of Object.entries(cookies)) {
            appState.push({ key: key, value: value, domain: '.facebook.com' });
        }
        return appState;
    }

    async initAPI() {
        if (!login) {
            this.log('⚠️ No API - Running in DEMO mode', 'warning');
            return null;
        }
        
        return new Promise((resolve) => {
            const appState = this.parseCookies(this.config.cookies);
            if (appState.length === 0) {
                this.log('❌ No valid cookies found!', 'error');
                resolve(null);
                return;
            }
            
            this.log('🔐 Logging into Facebook API...', 'info');
            
            login({ appState: appState }, (err, api) => {
                if (err) {
                    this.log(`❌ Login failed: ${err.message}`, 'error');
                    resolve(null);
                } else {
                    this.api = api;
                    this.log(`✅ Facebook API connected! REAL messages will be sent.`, 'success');
                    resolve(api);
                }
            });
        });
    }

    async validateTarget() {
        if (!this.api) return true;
        
        return new Promise((resolve) => {
            const { targetType, targetId } = this.config;
            const threadId = String(targetId).trim();
            
            if (targetType === 'group') {
                this.api.getThreadInfo(threadId, (err, info) => {
                    if (err) {
                        this.log(`⚠️ Cannot verify group: ${err.message}`, 'warning');
                        resolve(true);
                    } else {
                        this.log(`✅ Group verified: ${info.name || threadId}`, 'success');
                        resolve(true);
                    }
                });
            } else {
                this.api.getUserInfo(threadId, (err, info) => {
                    if (err) {
                        this.log(`⚠️ Cannot verify user: ${err.message}`, 'warning');
                        resolve(true);
                    } else {
                        const userName = info[threadId]?.name || threadId;
                        this.log(`✅ User verified: ${userName}`, 'success');
                        resolve(true);
                    }
                });
            }
        });
    }

    async sendMessage(msg) {
        const finalMsg = msg.replace(/{hater}/g, this.config.haterName);
        const threadId = String(this.config.targetId).trim();
        
        // DEMO mode - no API
        if (!this.api || !login) {
            this.log(`[DEMO] Would send: ${finalMsg.substring(0, 50)}...`, 'info');
            return true;
        }
        
        // REAL mode - send to Facebook
        return new Promise((resolve) => {
            this.api.sendMessage({ body: finalMsg }, threadId, (err) => {
                if (err) {
                    let errorMsg = err.message || 'Unknown error';
                    if (errorMsg.includes('authorization')) {
                        errorMsg = '🔐 Cookie expired - Get fresh cookies';
                        this.log(`❌ ${errorMsg}`, 'error');
                    } else if (errorMsg.includes('permission')) {
                        errorMsg = '🚫 No permission to post in this group';
                        this.log(`❌ ${errorMsg}`, 'error');
                    } else {
                        this.log(`❌ Send failed: ${errorMsg}`, 'error');
                    }
                    resolve(false);
                } else {
                    this.log(`✅ REAL message sent to ${this.config.targetType}!`, 'success');
                    resolve(true);
                }
            });
        });
    }

    async start() {
        // Initialize API if available
        if (login) {
            await this.initAPI();
            if (this.api) {
                await this.validateTarget();
            }
        } else {
            this.log('⚠️ fca-mafiya not installed - Install it for REAL messages!', 'warning');
            this.log('💡 Run: npm install fca-mafiya --force', 'info');
        }

        const messages = this.config.messages.split('\n').filter(m => m.trim());
        if (messages.length === 0) {
            this.log('❌ No messages in NP file!', 'error');
            return;
        }

        this.log(`🚀 TASK STARTED`, 'success');
        this.log(`📌 Target: ${this.config.targetType.toUpperCase()} | ID: ${this.config.targetId}`, 'info');
        this.log(`⏱️ Delay: ${this.config.delay} seconds`, 'info');
        this.log(`📨 Messages: ${messages.length} | 😈 Hater: ${this.config.haterName}`, 'info');
        
        if (!this.api || !login) {
            this.log(`⚠️ DEMO MODE: Messages are SIMULATED, not actually sent!`, 'warning');
        } else {
            this.log(`✅ REAL MODE: Messages will be sent to Facebook!`, 'success');
        }
        
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
            
            // Send stats
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

// WebSocket Events
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

        // Admin Auth
        if (data.type === 'admin_auth' && data.password === PASSWORDS.ADMIN) {
            adminSessions.add(ws);
            ws.send(JSON.stringify({ type: 'admin_approved' }));
            ws.send(JSON.stringify({ type: 'log', message: '👑 Admin mode ON', logType: 'success' }));
        }

        // Approve User
        if (data.type === 'admin_approve' && adminSessions.has(ws)) {
            approvedUsers.add(ws);
            ws.send(JSON.stringify({ type: 'approval_status', approved: true }));
            ws.send(JSON.stringify({ type: 'log', message: '✅ You are APPROVED!', logType: 'success' }));
        }

        // Disapprove User
        if (data.type === 'admin_disapprove' && adminSessions.has(ws)) {
            approvedUsers.delete(ws);
            ws.send(JSON.stringify({ type: 'approval_status', approved: false }));
            ws.send(JSON.stringify({ type: 'log', message: '❌ You are DISAPPROVED!', logType: 'error' }));
        }

        // Check Approval
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
                ws.send(JSON.stringify({ type: 'log', message: '❌ Not approved by admin!', logType: 'error' }));
                return;
            }

            if (!data.targetId || !data.cookieContent || !data.messageContent) {
                ws.send(JSON.stringify({ type: 'log', message: '❌ Missing: Target ID, Cookies, or NP File', logType: 'error' }));
                return;
            }

            const taskId = uuidv4();
            const task = new RealMessengerTask(taskId, ws, {
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

        // Monitor
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
    });
});

setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
}, 30000);
