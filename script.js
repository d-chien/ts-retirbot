// script.js
console.log("script.js version: 2.2.0");


let isSttReady = false;
let isRecording = false;

// 定義 ASR 相關的變數，但暫不賦值
let username_ASR = "";
let password_ASR = "";
const url_ASR = "https://asrapi01.bronci.com.tw";
const recordFileCheckbox = false;
const parserUrl = "";
const devices = "default";

let Recorder = null; // 初始化為 null

let autoScroll = true; // 確保這個變數有被宣告

/**
 * 使用代理器處理狀態
 */
const handler = {
    set: function (obj, props, value) {
        obj[props] = value;
    },
};
const proxy = new Proxy({ status: false, isRecording: false }, handler);

let sessionId_A = null;

// --- 新增: CSRF 管理器 ---
// 確保這是您的 Flask 後端 URL，特別是端口號
const BACKEND_FLASK_URL = "https://retibot-247393254326.us-central1.run.app"; // 請根據您的實際後端地址調整

class CsrfManager {
    constructor() {
        this.csrfToken = null;
    }

    async fetchCsrfToken() {
        try {
            const response = await fetch(`${BACKEND_FLASK_URL}/get-csrf-token`);
            if (!response.ok) {
                throw new Error(`Failed to fetch CSRF token: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            this.csrfToken = data.csrf_token;
            console.log("CSRF Token fetched successfully.");
        } catch (error) {
            console.error("Error fetching CSRF token:", error);
            // 根據您的錯誤處理策略，這裡可能需要阻止後續操作或提示使用者
        }
    }

    getCsrfHeaders() {
        if (!this.csrfToken) {
            console.warn("CSRF token is not available. Please ensure fetchCsrfToken() was called and successful.");
            // 嚴格模式下，這裡可以拋出錯誤，阻止未受保護的請求
            return {};
        }
        return {
            "X-CSRFToken": this.csrfToken,
        };
    }
}

const csrfManager = new CsrfManager(); // 實例化 CSRF 管理器

// 將所有 DOM 相關的初始化和事件綁定放在這一個 DOMContentLoaded 監聽器中
document.addEventListener('DOMContentLoaded', async () => {
    // 抓取 DOM 元素
    const recordButton = document.getElementById('record-button');
    const settingsButton = document.getElementById('settings-button');
    const voiceToggle = document.getElementById('voice-toggle');
    const languageSelect = document.getElementById('language-select');
    const sendButton = document.getElementById('send-button');
    const hideBannerButton = document.getElementById('hide-banner-button');
    const textInput = document.getElementById('textInput');

    // **重要：在頁面載入時就獲取 CSRF Token**
    await csrfManager.fetchCsrfToken();

    // **在這裡安全地獲取憑證**
    // try {
    //     console.log("嘗試獲取 ASR 憑證...");
    //     const credResponse = await callGetCredApi();
    //     const response = await fetch(`https://retibot-247393254326.us-central1.run.app/get_cred`, {
    //         method: "GET",
    //         headers: {
    //             "content-type": "application/json",
    //         }
    //     });
    //     const json = await response.json(); // 確保 await
    //     BOB = json.BOB;
    //     STEVE = json.STEVE;
    //     console.log('ASR 憑證獲取成功。');
    //     console.log('Account aquired');

    // } catch (error) {
    //     console.error(`無法獲取 ASR 憑證: ${error}`);
    //     // 顯示錯誤訊息給使用者或禁用功能
    //     recordButton.textContent = "憑證錯誤";
    //     return; // 無法獲取憑證則停止初始化
    // }
    try {
        console.log("嘗試獲取 ASR 憑證...");
        // 假設這是一個 GET 請求，並且不需要 CSRF 保護
        // 但如果這個 get_cred_api 是會改變後端狀態的 POST 請求，則需要下面的 CSRF 頭
        // 由於之前我們將其後端改為 POST 且受 CSRF 保護，這裡需要相應調整
        const credResponse = await callGetCredApi(); // 調用調整後的函數
        if (credResponse) {
            username_ASR = credResponse.BOB; // 假設這是用戶名
            password_ASR = credResponse.STEVE; // 假設這是密碼
            console.log("ASR 憑證獲取成功。");
        } else {
            console.warn("未能獲取 ASR 憑證。");
        }
    } catch (error) {
        console.error("獲取 ASR 憑證時發生錯誤:", error);
    }

    // 禁用按鈕直到登入成功
    recordButton.disabled = true;
    recordButton.textContent = "初始化中...";

    // 處理 session 初始化
    const sessionId = await initSession();
    if (sessionId) {
        console.log("Session 已初始化，sessionId:", sessionId);
        sessionId_A = sessionId;
    } else {
        console.error("Session 初始化失敗");
    }

    // 確保 handleInit 在憑證獲取後執行
    async function setupSTT() {
        try {
            console.log("語音功能開始初始化...");
            await navigator.mediaDevices.getUserMedia({ audio: true });
            await handleInit(); // 這裡會使用到 username_ASR 和 password_ASR
            console.log("初始化完成。");

            isSttReady = true;
            recordButton.disabled = false;
            recordButton.textContent = "🎤 語音輸入";
            console.log("錄音已準備就緒！");

        } catch (error) {
            console.error("錄音初始化或取得模型失敗:", error);
            recordButton.textContent = "錄音錯誤";
            // 如果初始化失敗，確保 Recorder 設為 null 或保持為 null
            Recorder = null; // 確保 Recorder 狀態正確
        }
    }

    // 執行錄音設置
    setupSTT();

    recordButton.addEventListener('click', async () => {
        if (!isSttReady) {
            console.warn("錄音連接尚未準備好，無法錄音。");
            return;
        }

        if (!isRecording) {
            // --- 開始錄音 ---
            try {
                console.log("嘗試開始錄音...");
                await handleStart();
                isRecording = true;
                recordButton.textContent = "⏹️ 停止輸入";
                console.log("錄音已開始。");

            } catch (error) {
                console.error("開始錄音失敗:", error);
                isRecording = false;
                recordButton.textContent = "🎤 語音輸入";
            }
        } else {
            // --- 停止錄音 ---
            try {
                console.log("嘗試停止錄音...");
                await handleStop();
                isRecording = false;
                recordButton.textContent = "🎤 語音輸入";
                console.log("錄音已停止。");

            } catch (error) {
                console.error("停止錄音失敗:", error);
                isRecording = false;
                recordButton.textContent = "🎤 語音輸入";
            }
        }
    });

    // 綁定事件監聽器
    settingsButton.addEventListener('click', toggleMenu);
    voiceToggle.addEventListener('change', toggleVoice);
    languageSelect.addEventListener('change', saveLanguage);
    sendButton.addEventListener('click', sendMessage);
    hideBannerButton.addEventListener('click', hideBanner);

    // keyboard watching
    textInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && isDesktopDevice()) {
            event.preventDefault();
            sendMessage();
        }
    });
});

// 新增: 調整 callServePdfApi 函數以包含 CSRF Token
async function callServePdfApi(sessionId) {
  // 確保 CSRF Token 已經獲取
  if (!csrfManager.csrfToken) {
      console.error("CSRF token not available. Cannot call serve_pdf_by_session API.");
      // 可以選擇重新嘗試獲取或直接返回錯誤
      await csrfManager.fetchCsrfToken(); // 嘗試重新獲取
      if (!csrfManager.csrfToken) return; // 如果還是沒有，則返回
  }

  try {
      const response = await fetch(`${BACKEND_FLASK_URL}/genpdf`, {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
              ...csrfManager.getCsrfHeaders(), // <-- 添加 CSRF Token 頭部
          },
          body: JSON.stringify({ session_id: sessionId }), // 根據後端要求，將 session_id 放在 body 中
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`PDF service API call failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("PDF service response:", data);
      return data;
  } catch (error) {
      console.error("Error calling serve_pdf_by_session:", error);
  }
}

// 新增: 調整 callGetCredApi 函數以包含 CSRF Token
async function callGetCredApi() {
  // 確保 CSRF Token 已經獲取
  if (!csrfManager.csrfToken) {
      console.error("CSRF token not available. Cannot call get_cred API.");
      await csrfManager.fetchCsrfToken(); // 嘗試重新獲取
      if (!csrfManager.csrfToken) return;
  }

  try {
      const response = await fetch(`${BACKEND_FLASK_URL}/get_cred`, {
          method: "POST", // 後端已改為 POST
          headers: {
              "Content-Type": "application/json",
              ...csrfManager.getCsrfHeaders(), // <-- 添加 CSRF Token 頭部
          },
          body: JSON.stringify({}), // 如果 get_cred 不需要 body 內容，可以傳遞空對象
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Get credentials API call failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log("Get credentials response:", data);
      return data;
  } catch (error) {
      console.error("Error calling get_cred:", error);
      throw error; // 重新拋出錯誤，讓調用方 (如 DOMContentLoaded 裡面的 try-catch) 處理
  }
}


async function initSession() {
    try {
        const requestOptions = {
            method: "POST",
            redirect: "follow"
        };

        const response = await fetch("https://retibot-247393254326.us-central1.run.app/init", requestOptions);
        const result = await response.json();
        console.log(result);

        appendMessage('bot', result.response);

        const sessionId = result.session_id;
        return sessionId;
    } catch (error) {
        console.error('初始化會話失敗:', error);
        appendMessage('bot', '初始化會話失敗');
        return null;
    }
}

/**
 * 判斷是否為桌面裝置
 */
function isDesktopDevice() {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|iphone|ipad|ipod|windows phone|iemobile|opera mini/i.test(userAgent);
    return !isMobile;
}

function toggleMenu() {
    const menu = document.getElementById('menu');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

let languageSelect_A = null;

function toggleVoice() {
    const voiceToggle = document.getElementById('voice-toggle').checked;
    const languageContainer = document.getElementById('language-container');
    if (voiceToggle) {
        languageContainer.style.display = 'block';
        const languageSelect = document.getElementById('language-select').value;
        languageSelect_A = languageSelect;
    } else {
        languageContainer.style.display = 'none';
        languageSelect_A = null;
    }
}

function saveLanguage() {
    const languageSelect = document.getElementById('language-select').value;
    languageSelect_A = languageSelect;
}

const chat = document.getElementById('chat');
async function sendMessage() {
    const input = document.getElementById('textInput');
    const text = input.value.trim();
    if (text === '') return;

    if (text.length>300) {
      alert('訊息過長');
      return;
    };

    appendMessage('user', text);
    input.value = '';

    appendLoading();

    fetch('https://retibot-247393254326.us-central1.run.app/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId_A, message: text })
    })
        .then(res => res.json())
        .then(async data => {
            removeLoading();
            appendMessage('bot', DOMPurify.sanitize(data.response));
            const TTS_TW = new TTS();
            const textFromAnotherBot = data.res_for_sound;
            TTS_TW.setLanguage(languageSelect_A);
            if (document.getElementById('voice-toggle').checked) {
                TTS_TW.synthesizeSpeech(textFromAnotherBot);
            }
            if (data.ending !== 0) {
                appendLoading();
                if (data.ending === 1) {
                    try {
                        await generatePDF(data);
                    } catch (error) {
                        console.error("Error generating PDF:", error);
                        appendMessage('bot', "PDF 報告生成失敗。");
                    }
                };

                removeLoading();
                appendMessage('bot', "本次諮詢已結束，如要重新開始對話重整頁面。");

                const inputArea = document.querySelector(".input-area");
                inputArea.style.display = "none";
            }
        })
        .catch(error => {
            removeLoading();
            console.error('Error', error);
            appendMessage('bot', '很抱歉，大宇宙意識斷線中，請重整頁面以重新連接。')
        });
}
async function appendPDFMessage(urllink) {
    const message = document.createElement('div');
    message.className = 'message bot';

    const avatar = document.createElement('div');
    avatar.className = ' avatar';
    message.appendChild(avatar);

    const content = document.createElement('a');
    content.className = `ProposalLink`;
    content.href = urllink;
    content.textContent = '點此下載/查看您的PDF檔案(請於15分鐘內下載)';
    content.target = '_blank';
    content.download = '文件.pdf'; // 修正下載時檔名為 '文件.pdf'
    const bubble = document.createElement('div');
    bubble.className = ' bubble';
    bubble.appendChild(content);
    message.appendChild(bubble);

    chat.appendChild(message);
    chat.scrollTop = chat.scrollHeight;

    const message2 = document.createElement('div');
    message2.className = 'message bot';
    const avatar2 = document.createElement('div');
    avatar2.className = ' avatar';
    message2.appendChild(avatar2);
    const bubble2 = document.createElement('div');
    bubble2.className = 'bubble';
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, urllink, {
        width: 200,
        color: {
            dark: '#ffffff',
            light: '#e53935',
        },
        correctLevel: 'H',
    });
    bubble2.appendChild(canvas);
    message2.appendChild(bubble2);
    chat.appendChild(message2);
    chat.scrollTop = chat.scrollHeight;

    console.log('link and QRCODE showed.');
}

function appendMessage(sender, text) {
    const message = document.createElement('div');

    const customRenderer = new marked.Renderer();
    customRenderer.link = function (href, title, text) {
        let html = `<a href="${href}"`;
        if (title) {
            html += ` title "${title}"`;
        }
        html += ` target="_blank" rel="noopener noreferrer">${text}</a>`;
        return html;
    }

    marked.setOptions({
        renderer: customRenderer,
        breaks: true
    })

    message.className = `message ${sender}`;
    if (sender === 'bot') {
        const avatar = document.createElement('div');
        avatar.className = ' avatar';
        message.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = ' bubble';
        
        const unsafeHTML = marked.parse(text);
        const sanitizedHTML = DOMPurify.sanitize(unsafeHTML);

        bubble.innerHTML = sanitizedHTML;
        message.appendChild(bubble);

    } else if (sender === 'user') {
        const bubble = document.createElement('div');
        bubble.className = ' bubble';
        bubble.textContent = text;
        message.appendChild(bubble);
    }

    chat.appendChild(message);
    chat.scrollTop = chat.scrollHeight;
}

let loadingMessage;
function appendLoading() {
    loadingMessage = document.createElement('div');
    loadingMessage.className = 'message bot'

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    loadingMessage.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.innerHTML = '<span></span><span></span><span></span>';

    bubble.appendChild(loading);
    loadingMessage.appendChild(bubble);

    chat.appendChild(loadingMessage);
    chat.scrollTop = chat.scrollHeight;
}

function removeLoading() {
    if (loadingMessage) {
        chat.removeChild(loadingMessage);
        loadingMessage = null;
    }
}

async function generatePDF(data) {
    try {
        const response = await fetch('https://retibot-247393254326.us-central1.run.app/genpdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: data.session_id, proposal: data.response }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const pdfdata = await response.json();
        const pdfUrl = pdfdata.url;

        if (pdfUrl) {
            console.log('link Retrieved: ', pdfUrl);
            appendPDFMessage(pdfUrl);
        } else {
            console.error('fail to retrieve PDF link', pdfdata);
        }
    } catch (error) {
        console.error('generate PDF failed: ', error);
    }
}

/**
 * 允許麥克風權限
 */
let tempStream = null;
async function getUserMediaPermission() {
    tempStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            noiseSuppression: false,
            autoGainControl: false,
        },
        video: false,
    });
}

/**
 * 初始化
 */
async function handleInit() {
    try {
        handleDestroy();

        // 關鍵修正：確保傳入 username_ASR, password_ASR, url_ASR, recordFileCheckbox
        Recorder = new ASRRecorder(
            BOB, // 傳遞 username
            STEVE, // 傳遞 password
            url_ASR,
            recordFileCheckbox
        );
        console.log("Initialized");
        proxy.status = true;
    } catch (error) {
        console.log("初始化錯誤：", error);
        proxy.status = false;
        Recorder = null; // 初始化失敗時確保 Recorder 為 null
    }
}

/**
 * 開始轉換聲音資料
 */
async function handleStart() {
    const parserUrlValue = parserUrl;
    const model = null;
    const deviceValue = null;

    try {
        // 確保 Recorder 存在才呼叫 start
        if (Recorder) {
            await Recorder.start(model, deviceValue, parserUrlValue, (data) => {
                handleRender(data);
            });
        } else {
            // 這個錯誤很可能是因為 handleInit 失敗了
            throw new Error("Recorder is not initialized.");
        }
        await setScreenLock();
        proxy.isRecording = true;
    } catch (error) {
        console.error(error); // 改為 console.error 更清晰
        handleStop();
    }
}

/**
 * 停止轉換聲音資料
 */
async function handleStop() {
    // 確保 Recorder 存在才呼叫 stop
    if (Recorder) {
        await Recorder.stop();
    } else {
        console.warn("Recorder is null, cannot stop.");
    }
    await releaseScreenLock();
    proxy.isRecording = false;
}

/**
 * 當你離開頁面時，若頁面有 keep-alive 機制，請用此函式停止轉換聲音資料及回復 ASRRecorder 初始狀態
 */
function handleDestroy() {
    if (Recorder) {
        Recorder.destroy();
        Recorder = null; // 銷毀後將 Recorder 設為 null
    }
}

/**
 * Demo 如何將翻譯好的資料渲染到畫面上
 */
function handleRender(data) {
    const { code, result, status, message2, bits, volume } = data;

    if (status) {
        if (status === "opened") {
            console.log(status);
        } else if (status === "closed") {
            console.log(status);
            handleStop();
        } else if (status === "bits") {
            console.log(status);
        } else if (status === "volume") {
            console.log(status);
        }
        return;
    }

    if (code === 100 || code === 180) return;

    const errorCode = [401, 408, 415, 486, 500, 502, 503, 599];
    if (errorCode.includes(code)) {
        console.log(code);
        handleStop();
    }

    if (code === 204) {
        console.log(code);
        handleStop();
    }

    if (code === 200) {
        console.log(code);
        const { segment, transcript, final } = result[0];
        const textInput = document.getElementById('textInput');
        textInput.value = result[0].transcript;
        console.log("錄音結果", result[0].transcript);
    }
}

/**
 * 確認瀏覽器是否支援 screen wake lock
 */
function isScreenLockSupported() {
    return "wakeLock" in navigator;
}

/**
 * 設定瀏覽器 screen lock
 */
let screenLock;
async function setScreenLock() {
    if (isScreenLockSupported()) {
        try {
            screenLock = await navigator.wakeLock.request("screen");
            console.log(`screen lock ${screenLock}`);
        } catch (error) {
            console.log(error.name, error.message2);
        }
    }
}

/**
 * 釋放瀏覽器 screen lock
 */
async function releaseScreenLock() {
    if (typeof screenLock !== "undefined" && screenLock !== null) {
        await screenLock.release();
        console.log(`screen lock released`);
        screenLock = null;
    }
}

/**
 * 變更 isRecord 狀態
 */
function handleChangeRecordFile() {
    if (Recorder) {
        Recorder.setIsRecord = recordFileCheckbox.checked;
    }
}

// 這個函式會在點擊「確定」按鈕時執行
function hideBanner() {
    const cookieBanner = document.getElementById('cookie-banner');
    if (cookieBanner) {
        cookieBanner.style.display = 'none';
    }
}

console.log(`Function:智能機器人 Author:Daniel Chien`);
console.log(`Function:語音輸入與輸出 Author:長問科技`);
console.log(`Function:前端介面與串接 Author:Angela Ko`);
const VERSION = "1.0.5";