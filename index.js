// ═══════════════════════════════════════════════════
//   TENGEN BOT — الإصدار النهائي 3.0
//   المانع + مميز + ألعاب عشوائية + قناة مخفية
// ═══════════════════════════════════════════════════

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

// ═══════════════════════════════════════════════════
//   الإعدادات
// ═══════════════════════════════════════════════════
const CONFIG = {
    BOT_NAME: 'TENGEN BOT',
    PREFIX: '.',
    SPAM_LIMIT: 6,
    SPAM_WINDOW: 10000,
    INSTALL_CODE_TTL: 60000,
    CHANNEL: 'https://whatsapp.com/channel/0029Vb8ulSNFMqrh8ITeZf3L'
};

const PHONE = process.env.PHONE_NUMBER || process.argv[2];

// ═══════════════════════════════════════════════════
//   قاعدة البيانات
// ═══════════════════════════════════════════════════
const DB_FILE = './database.json';

function loadDB() {
    const DEFAULT = {
        groups: {}, warnings: {}, installedBots: {}, mutedBots: {},
        primaryBot: null, premiumUsers: [], premiumGlobal: false, premiumGroups: []
    };
    if (!fs.existsSync(DB_FILE)) return DEFAULT;
    try {
        const d = JSON.parse(fs.readFileSync(DB_FILE));
        return {
            groups: d.groups || {},
            warnings: d.warnings || {},
            installedBots: d.installedBots || {},
            mutedBots: d.mutedBots || {},
            primaryBot: d.primaryBot || null,
            premiumUsers: d.premiumUsers || [],
            premiumGlobal: d.premiumGlobal || false,
            premiumGroups: d.premiumGroups || []
        };
    } catch { return DEFAULT; }
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

let db = loadDB();
const msgLog = {};
let sock = null;

// ═══════════════════════════════════════════════════
//   دوال مساعدة
// ═══════════════════════════════════════════════════
function hasLink(t) {
    if (!t) return false;
    return [/https?:\/\/[^\s]+/gi, /www\.[^\s]+/gi, /chat\.whatsapp\.com\/[A-Za-z0-9]+/gi,
            /wa\.me\/[0-9]+/gi, /t\.me\/[^\s]+/gi].some(p => p.test(t));
}
function hasContact(m) { return !!(m.message?.contactMessage || m.message?.contactsArrayMessage); }
function getText(m) {
    return m.message?.conversation || m.message?.extendedTextMessage?.text ||
           m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || '';
}

async function getAdmins(g) {
    try {
        const meta = await sock.groupMetadata(g);
        return meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
    } catch { return []; }
}
async function isAdmin(g, s) { return (await getAdmins(g)).includes(s); }

function isPremium(sender, chatJid) {
    const num = sender.split('@')[0];
    if (!db.premiumUsers.includes(num)) return false;
    if (db.premiumGlobal) return true;
    if (db.premiumGroups.includes(chatJid)) return true;
    return false;
}

async function send(jid, text, mentions = []) {
    const channel = `\n\n📢 ||${CONFIG.CHANNEL}||`;
    return sock.sendMessage(jid, { text: text + channel, mentions });
}

async function delMsg(c, i, s) {
    try { await sock.sendMessage(c, { delete: { remoteJid: c, fromMe: false, id: i, participant: s } }); } catch (e) {}
}

// ═══════════════════════════════════════════════════
//   توليد رمز تنصيب (دقيقة واحدة)
// ═══════════════════════════════════════════════════
async function generateInstallCode(num) {
    const dir = './install_' + num;
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    const { state, saveCreds } = await useMultiFileAuthState(dir);
    const { version } = await fetchLatestBaileysVersion();
    const tmp = makeWASocket({
        version, auth: state, logger: pino({ level: 'silent' }),
        printQRInTerminal: false, browser: ['TENGEN BOT', 'Chrome', '1.0.0']
    });
    tmp.ev.on('creds.update', saveCreds);
    return new Promise((resolve, reject) => {
        let done = false;
        tmp.ev.on('connection.update', (u) => {
            if (!tmp.authState.creds.registered && !done) {
                setTimeout(async () => {
                    try {
                        const code = await tmp.requestPairingCode(num);
                        done = true;
                        db.installedBots[num] = {
                            code, time: new Date().toISOString(),
                            expiresAt: Date.now() + CONFIG.INSTALL_CODE_TTL,
                            status: 'بانتظار'
                        };
                        saveDB();
                        try { tmp.end(undefined); } catch (e) {}
                        resolve(code);
                    } catch (e) {
                        if (!done) { done = true; try { tmp.end(undefined); } catch (er) {} reject(e); }
                    }
                }, 2000);
            }
            if (u.connection === 'open' && !done) { done = true; reject(new Error('الرقم مسجل')); }
        });
        setTimeout(() => { if (!done) { done = true; try { tmp.end(undefined); } catch (e) {} reject(new Error('انتهت المهلة')); } }, 15000);
    });
}

// ═══════════════════════════════════════════════════
//   قائمة الأوامر
// ═══════════════════════════════════════════════════
const COMMANDS_LIST = `
╔══════════════════════════════════╗
║      🤖 ${CONFIG.BOT_NAME}       ║
╚══════════════════════════════════╝

🛡️ *المانع*
│ ${CONFIG.PREFIX}المانع | ${CONFIG.PREFIX}ايقاف | ${CONFIG.PREFIX}حالة
│ ${CONFIG.PREFIX}قفل | ${CONFIG.PREFIX}فتح

👥 *الأعضاء*
│ ${CONFIG.PREFIX}طرد @عضو | ${CONFIG.PREFIX}ترقية @عضو
│ ${CONFIG.PREFIX}تخفيض @عضو | ${CONFIG.PREFIX}تحذير @عضو

📋 *عامة*
│ ${CONFIG.PREFIX}اوامر | ${CONFIG.PREFIX}معلومات
│ ${CONFIG.PREFIX}وقت | ${CONFIG.PREFIX}رابط

🎮 *الألعاب*
│ ${CONFIG.PREFIX}لعبة (عشوائية)
│ ${CONFIG.PREFIX}كتابة | ${CONFIG.PREFIX}تفكيك
│ ${CONFIG.PREFIX}تخمين | ${CONFIG.PREFIX}حزورة

﷽
اللهمَّ صلِّ وسلِّم على نبيِّنا محمدٍ ﷺ`;

// ═══════════════════════════════════════════════════
//   تشغيل البوت
// ═══════════════════════════════════════════════════
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
        version, auth: state, logger: pino({ level: 'silent' }),
        printQRInTerminal: false, browser: ['TENGEN BOT', 'Chrome', '3.0.0']
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect } = u;
        if (!sock.authState.creds.registered && PHONE) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(PHONE.replace(/[^0-9]/g, ''));
                    console.log('\n════════════════════════════════════════');
                    console.log(`   🔑 رمز التنصيب: ${code}`);
                    console.log('════════════════════════════════════════\n');
                } catch (e) { console.error('❌ فشل:', e.message); }
            }, 3000);
        }
        if (connection === 'open') {
            const num = sock.user?.id?.split(':')[0]?.split('@')[0];
            console.log(`\n✅ متصل! الرقم: ${num}\n`);
            if (num && !db.primaryBot) { db.primaryBot = num; saveDB(); console.log(`👑 البوت الرئيسي: ${num}\n`); }
        }
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 إعادة الاتصال...');
                setTimeout(startBot, 3000);
            }
        }
    });

    sock.ev.on('group-participants.update', async (u) => {
        const { id, participants, action } = u;
        if (action !== 'add') return;
        const mn = sock.user?.id?.split(':')[0]?.split('@')[0];
        if ((db.mutedBots[id] || []).includes(mn)) return;
        for (const p of participants) {
            const n = p.split('@')[0];
            try {
                const st = await sock.onWhatsApp(n + '@s.whatsapp.net');
                if (st && st[0]?.exists) {
                    const nm = st[0].notify || '';
                    if (nm.toLowerCase().includes('bot') || nm.includes('بوت') || nm.includes('BOT')) {
                        await send(id, `⚠️ *تحذير أمني*\n\n🚨 عضو يُشتبه بوت!\n📱 ${n}\n👤 ${nm}\n\n🔒 تم قفل المجموعة`);
                        await sock.groupSettingUpdate(id, 'announcement');
                    }
                }
            } catch (e) {}
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) { try { await handleMessage(msg); } catch (e) {} }
    });
}

// ═══════════════════════════════════════════════════
//   معالج الرسائل
// ═══════════════════════════════════════════════════
async function handleMessage(msg) {
    if (!msg.message || msg.key.fromMe) return;
    const c = msg.key.remoteJid, s = msg.key.participant || c;
    const isG = c.endsWith('@g.us'), t = getText(msg), id = msg.key.id;

    if (isG) {
        const mn = sock.user?.id?.split(':')[0]?.split('@')[0];
        if ((db.mutedBots[c] || []).includes(mn)) return;
    }
    if (t.startsWith(CONFIG.PREFIX)) { await handleCommand(msg, c, s, t, isG); return; }
    if (!isG) return;

    const set = db.groups[c] || { protection: true };
    if (!set.protection) return;

    const adm = await isAdmin(c, s);
    const premium = isPremium(s, c);
    const privileged = adm || premium;

    if (hasContact(msg)) {
        await delMsg(c, id, s);
        if (!privileged) { try { await sock.groupParticipantsUpdate(c, [s], 'remove'); } catch (e) {} }
        await send(c, `🚫 *المانع: جهة اتصال*\n👤 @${s.split('@')[0]}\n${privileged ? 'تحذير' : 'طرد'} + 🔒 قفل`, [s]);
        await sock.groupSettingUpdate(c, 'announcement');
        return;
    }
    if (hasLink(t) && !privileged) {
        await delMsg(c, id, s);
        await send(c, `🔗 *رابط محذوف*\n👤 @${s.split('@')[0]}`, [s]);
        return;
    }
    if (!privileged) {
        const n = Date.now();
        if (!msgLog[s]) msgLog[s] = [];
        msgLog[s] = msgLog[s].filter(m => n - m.time < CONFIG.SPAM_WINDOW);
        msgLog[s].push({ id, time: n });
        if (msgLog[s].length >= CONFIG.SPAM_LIMIT) {
            for (const m of msgLog[s]) await delMsg(c, m.id, s);
            msgLog[s] = [];
            await send(c, `⚠️ *سبام*\n👤 @${s.split('@')[0]}\n🗑️ حُذفت ${CONFIG.SPAM_LIMIT} رسائل`, [s]);
        }
    }
}

// ═══════════════════════════════════════════════════
//   معالج الأوامر
// ═══════════════════════════════════════════════════
async function handleCommand(msg, c, s, t, isG) {
    const a = t.slice(CONFIG.PREFIX.length).trim().split(/\s+/);
    const cmd = a[0].toLowerCase();
    const men = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const adm = isG ? await isAdmin(c, s) : false;
    const premium = isG ? isPremium(c, s) : false;
    const priv = adm || premium;
    const mn = sock.user?.id?.split(':')[0]?.split('@')[0];
    const isP = mn === db.primaryBot;

    // ═══ الأوامر المخفية ═══

    if (cmd === 'تنصيب' || cmd === 'install') {
        if (!isP) return;
        const num = a[1]?.replace(/[^0-9]/g, '');
        if (!num) return send(c, '❌ .تنصيب 213xxxxxxxxx');
        await send(c, `⏳ جاري التوليد...`);
        try {
            const code = await generateInstallCode(num);
            await send(c, `📦 *تنصيب بوت*\n📱 ${num}\n🔑 *${code}*\n\n⏱️ الصلاحية: دقيقة واحدة`);
        } catch (e) { await send(c, `❌ ${e.message}`); }
        return;
    }

    if (cmd === 'صمت') {
        if (!isP && !adm) return;
        if (!isG) return;
        db.mutedBots[c] = Object.keys(db.installedBots);
        saveDB();
        await send(c, `🔇 كتم ${db.mutedBots[c].length} بوت`);
        return;
    }

    if (cmd === 'فك_صمت') {
        if (!isP && !adm) return;
        if (!isG) return;
        const n = (db.mutedBots[c] || []).length;
        db.mutedBots[c] = [];
        saveDB();
        await send(c, `🔊 تفعيل ${n} بوت`);
        return;
    }

    if (cmd === 'البوتات') {
        if (!isP) return;
        const b = Object.entries(db.installedBots);
        if (!b.length) return send(c, '📭 لا توجد بوتات');
        let l = '🤖 *البوتات*\n\n';
        for (const [n, i] of b) {
            const ex = i.expiresAt && i.expiresAt <= Date.now();
            l += `📱 ${n}\n🔑 ${i.code}\n📊 ${ex ? '⌛ منتهي' : (i.status || 'بانتظار')}\n\n`;
        }
        return send(c, l);
    }

    // ═══ الأوامر المميزة ═══

    if (cmd === 'مميز' && !a[1]) {
        if (!isP) return;
        db.premiumGlobal = true;
        saveDB();
        return send(c, `👑 *الوضع المميز*\n\n✅ مفعل في كل المجموعات\n👥 المميزون: ${db.premiumUsers.length}`);
    }
    if (cmd === 'مميز' && a[1] === 'ايقاف' && !a[2]) {
        if (!isP) return;
        db.premiumGlobal = false;
        saveDB();
        return send(c, `⏸️ *الوضع المميز*\n\nموقوف في كل المجموعات`);
    }
    if (cmd === 'مميز' && a[1] === 'فردي' && !a[2]) {
        if (!isP || !isG) return;
        if (!db.premiumGroups.includes(c)) db.premiumGroups.push(c);
        saveDB();
        return send(c, `👑 *مميز فردي*\n\n✅ مفعل في هذه المجموعة فقط`);
    }
    if (cmd === 'مميز' && a[1] === 'فردي' && a[2] === 'ايقاف') {
        if (!isP || !isG) return;
        db.premiumGroups = db.premiumGroups.filter(g => g !== c);
        saveDB();
        return send(c, `⏸️ *مميز فردي*\n\nموقوف في هذه المجموعة`);
    }
    if (cmd === 'مميز' && a[1] === 'اضف') {
        if (!isP) return;
        const t2 = a[2]?.replace(/[^0-9]/g, '');
        if (!t2) return send(c, '❌ .مميز اضف 213xxxxxxxxx');
        if (db.premiumUsers.includes(t2)) return send(c, '⚠️ موجود مسبقاً');
        db.premiumUsers.push(t2);
        saveDB();
        return send(c, `👑 *إضافة مميز*\n📱 ${t2}\n✅ تم\n👥 الإجمالي: ${db.premiumUsers.length}`);
    }
    if (cmd === 'مميز' && a[1] === 'حذف') {
        if (!isP) return;
        const t2 = a[2]?.replace(/[^0-9]/g, '');
        if (!t2) return send(c, '❌ .مميز حذف 213xxxxxxxxx');
        db.premiumUsers = db.premiumUsers.filter(u => u !== t2);
        saveDB();
        return send(c, `🗑️ تم حذف ${t2}`);
    }
    if (cmd === 'مميز' && a[1] === 'قائمة') {
        if (!isP) return;
        if (!db.premiumUsers.length) return send(c, '📭 لا يوجد مميزون');
        let l = `👑 *المميزون*\n\n`;
        db.premiumUsers.forEach((u, i) => l += `${i + 1}. ${u}\n`);
        l += `\n📊 العام: ${db.premiumGlobal ? '✅' : '❌'}\n📍 الفردي: ${db.premiumGroups.length}`;
        return send(c, l);
    }

    // ═══ الأوامر العلنية ═══

    if (cmd === 'اوامر' || cmd === 'help') return send(c, COMMANDS_LIST);
    if (cmd === 'معلومات' || cmd === 'info') {
        const role = isP ? '👑 رئيسي' : '🤖 عادي';
        return send(c, `🤖 *${CONFIG.BOT_NAME}*\n📌 الإصدار: 3.0.0\n🛡️ المانع\n⚙️ ${CONFIG.PREFIX}\n👑 ${role}\n\n﷽\nاللهمَّ صلِّ وسلِّم على نبيِّنا محمدٍ ﷺ`);
    }
    if (cmd === 'وقت') return send(c, `🕐 ${new Date().toLocaleString('ar-DZ')}`);
    if (cmd === 'رابط') {
        if (!isG) return;
        try { const x = await sock.groupInviteCode(c); return send(c, `🔗 https://chat.whatsapp.com/${x}`); }
        catch { return send(c, '❌'); }
    }

    if (cmd === 'المانع' || cmd === 'تفعيل') {
        if (!adm) return;
        db.groups[c] = db.groups[c] || {};
        db.groups[c].protection = true;
        saveDB();
        return send(c, '🛡️ المانع مفعل');
    }
    if (cmd === 'ايقاف') {
        if (!adm) return;
        db.groups[c] = db.groups[c] || {};
        db.groups[c].protection = false;
        saveDB();
        return send(c, '⏸️ المانع معطل');
    }
    if (cmd === 'حالة') {
        const x = db.groups[c] || { protection: true };
        return send(c, `📊 المانع: ${x.protection ? '✅ مفعل' : '❌ معطل'}`);
    }
    if (cmd === 'قفل') { if (!adm || !isG) return; await sock.groupSettingUpdate(c, 'announcement'); return send(c, '🔒'); }
    if (cmd === 'فتح') { if (!adm || !isG) return; await sock.groupSettingUpdate(c, 'not_announcement'); return send(c, '🔓'); }

    if (cmd === 'طرد') {
        if (!priv || !men.length) return;
        for (const j of men) { try { await sock.groupParticipantsUpdate(c, [j], 'remove'); } catch (e) {} }
        return send(c, `✅ طرد ${men.length}`);
    }
    if (cmd === 'ترقية') {
        if (!priv || !men.length) return;
        for (const j of men) await sock.groupParticipantsUpdate(c, [j], 'promote');
        return send(c, `✅ ترقية ${men.length}`);
    }
    if (cmd === 'تخفيض') {
        if (!priv || !men.length) return;
        for (const j of men) await sock.groupParticipantsUpdate(c, [j], 'demote');
        return send(c, `✅ تخفيض ${men.length}`);
    }
    if (cmd === 'تحذير') {
        if (!priv || !men.length) return;
        for (const j of men) {
            const n = j.split('@')[0];
            db.warnings[n] = (db.warnings[n] || 0) + 1;
            saveDB();
            await send(c, `⚠️ @${n}\n📊 ${db.warnings[n]}/3`, [j]);
            if (db.warnings[n] >= 3) {
                await sock.groupParticipantsUpdate(c, [j], 'remove');
                await send(c, `🚫 طرد @${n}`, [j]);
                db.warnings[n] = 0;
                saveDB();
            }
        }
        return;
    }

    // ═══ الألعاب العشوائية ═══

    if (cmd === 'لعبة' || cmd === 'game') {
        const games = ['كتابة', 'تفكيك', 'تخمين', 'حزورة'];
        const chosen = games[Math.floor(Math.random() * games.length)];
        return handleCommand(msg, c, s, CONFIG.PREFIX + chosen, isG);
    }

    if (cmd === 'كتابة') {
        const words = ['الجزائر', 'واتساب', 'بوت', 'حماية', 'قمر', 'شمس', 'بحر', 'نجم', 'مطر', 'كتاب', 'قلم', 'ورد'];
        const w = words[Math.floor(Math.random() * words.length)];
        return send(c, `🎮 *كتابة سريعة*\n\n➡️ *${w}*\n\n⏱️ 15 ثانية!`);
    }

    if (cmd === 'تفكيك') {
        const words = ['مستشفى', 'جامعة', 'مكتبة', 'سيارة', 'طائرة', 'حاسوب', 'مدرسة', 'هاتف', 'بحر', 'جبل', 'قمر', 'شمس'];
        const w = words[Math.floor(Math.random() * words.length)];
        const sc = w.split('').sort(() => Math.random() - 0.5).join('');
        return send(c, `🎮 *تفكيك الكلمات*\n\n➡️ *${sc}*\n\n🤔 الكلمة الأصلية؟`);
    }

    if (cmd === 'تخمين') {
        const n = Math.floor(Math.random() * 100) + 1;
        return send(c, `🎮 *تخمين الرقم*\n\nخمّن رقماً بين 1 و 100`);
    }

    if (cmd === 'حزورة') {
        const riddles = [
            { q: 'شيء إذا لمسته صرخ، وإذا تركته سكت؟', a: 'الجرس' },
            { q: 'يمشي بلا أرجل، ويبكي بلا عيون؟', a: 'السحاب' },
            { q: 'كلما أخذت منه كبر؟', a: 'الحفرة' },
            { q: 'له أسنان ولا يعض؟', a: 'المشط' },
            { q: 'يدخل الماء ولا يبتل؟', a: 'الضوء' },
            { q: 'له عين ولا يرى؟', a: 'الإبرة' },
            { q: 'كلما زاد نقص؟', a: 'العمر' },
            { q: 'يشرب الماء ويعطش؟', a: 'الإسفنج' }
        ];
        const r = riddles[Math.floor(Math.random() * riddles.length)];
        return send(c, `🧩 *حزورة*\n\n${r.q}\n\n💡 ||${r.a}||`);
    }
}

// ═══════════════════════════════════════════════════
//   تشغيل
// ═══════════════════════════════════════════════════
console.log(`
╔════════════════════════════════════════╗
║         🤖 TENGEN BOT 🤖              ║
║   ﷽                                    ║
║   اللهمَّ صلِّ وسلِّم على نبيِّنا محمدٍ ﷺ    ║
╚════════════════════════════════════════╝
`);

startBot().catch(console.error);
process.on('uncaughtException', (e) => console.error('خطأ:', e.message));