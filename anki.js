// ==========================================
// ANKI FLASHCARD ASSISTANT - DEOBFUSCATED
// ==========================================

// Configuration and Constants
const CONFIG = {
    API_BASE_URL: 'https://langki-ai-freetier.deno.dev',
    MESSAGE_DB_URL: 'https://ai-message-db.deno.dev/messages',
    API_KEY: 'xk_1927409uqoz',
    START_MARKER: '<Start>28011997',
    END_MARKER: '<End>',
    DEFAULT_VOICE: 'alloy',
    DEFAULT_LANGUAGE: 'en-US',
    DEFAULT_NEURAL_VOICE: 'en-US-AndrewMultilingualNeural',
    WORD_LIMIT: 2000,
    DAILY_LIMIT_MESSAGE: `
        <div>
            <p>You have reached your daily AI usage limit. Please enter an API key to continue using the service.</p>
            <a href="https://langki.net/donate">For more detailed information, please visit here.</a>
        </div>
    `
};

// System Prompts
const SYSTEM_PROMPTS = {
    FLASHCARD_CREATOR: `
System: You are an AI that creates flashcards. YOU MUST RETURN **one object** with 2 properties: "front", "back" in **JSON format**. Both "front" and "back" values are **HTML string**. If there is an image insert description in the property "alt" of the img tag and the description must contain all relevant information to answer the flashcard and all the text in the image. DO NOT GENERATE IMAGE. Generate HTML flashcards, but do not include the 'description' attribute in the HTML elements.
User: 
<<Prompt>>
    `,
    
    TEST_ME_RESPONSE: `
AI: Ok, but first we need to create the flashcard and then I will follow your instruction.
    `
};

// CSS Styles
const STYLES = `
    .langki-credit {
        position: fixed;
        bottom: 10px;
        right: 10px;
        font-size: 14px;
        background: rgba(0, 0, 0, 0.6);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        text-decoration: none;
        z-index: 9999;
    }

    @media (max-width: 600px) {
        .langki-credit {
            display: none;
        }
    }

    .flashcard {
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        border-radius: 15px;
        background: white;
        padding: 20px;
        margin: 20px 0;
    }

    .flashcard-front, .flashcard-back {
        padding: 15px;
    }

    .message-list {
        overflow-y: auto;
        padding: 10px;
    }

    .message-item {
        margin: 10px 0;
        padding: 10px;
        border-radius: 8px;
    }

    .pronunciation-assessment {
        background-color: #f0f0f0;
        padding: 15px;
        border-radius: 8px;
        margin: 10px 0;
    }

    .pronunciation-word {
        display: inline-block;
        margin: 5px;
        padding: 5px 10px;
        border-radius: 4px;
    }

    .recognized-text {
        font-size: 16px;
        margin: 10px 0;
    }

    .detail-list {
        list-style: none;
        padding: 0;
    }

    .toggle-details {
        background: #4CAF50;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
    }

    .loading-spinner {
        border: 3px solid #f3f3f3;
        border-top: 3px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;

// Utility Functions
const utils = {
    // Check if running in AnkiMobile
    isAnkiMobile() {
        return navigator.userAgent.includes('AnkiMobile');
    },

    // Check if running on localhost
    isLocalhost() {
        return window.location.hostname === '127.0.0.1' || 
               window.location.hostname === 'localhost';
    },

    // Encode text to base64
    encodeBase64(text) {
        return btoa(unescape(encodeURIComponent(text)));
    },

    // Decode base64 to text
    decodeBase64(base64) {
        return decodeURIComponent(escape(atob(base64)));
    },

    // Trim text
    trim(text) {
        return text.trim();
    },

    // Generate timestamp
    getTimestamp() {
        return new Date().toISOString();
    },

    // Create element from HTML string
    createElementFromHTML(htmlString) {
        const div = document.createElement('div');
        div.innerHTML = htmlString.trim();
        return div.firstChild;
    }
};

// API Service
const apiService = {
    // Transcribe audio
    async transcribeAudio(audioBlob, language = 'en-US') {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.wav');
        formData.append('language', language);

        const response = await fetch(`${CONFIG.API_BASE_URL}/transcribe`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Transcription failed: ${response.statusText}`);
        }

        return await response.json();
    },

    // Text to speech
    async textToSpeech(text, voice = CONFIG.DEFAULT_VOICE) {
        const response = await fetch(`${CONFIG.API_BASE_URL}/tts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text, voice })
        });

        if (!response.ok) {
            throw new Error(`TTS failed: ${response.statusText}`);
        }

        return await response.blob();
    },

    // Chat with AI
    async chat(messages, apiKey = null) {
        const response = await fetch(`${CONFIG.API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
            },
            body: JSON.stringify({ messages })
        });

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('DAILY_LIMIT_EXCEEDED');
            }
            throw new Error(`Chat failed: ${response.statusText}`);
        }

        return await response.json();
    },

    // Save message to database
    async saveMessage(message) {
        try {
            await fetch(CONFIG.MESSAGE_DB_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message,
                    timestamp: utils.getTimestamp()
                })
            });
        } catch (error) {
            console.error('Failed to save message:', error);
        }
    }
};

// Audio Recording Service
class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isRecording = false;
    }

    async startRecording() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            console.log('Recording started');
        } catch (error) {
            console.error('Error accessing microphone:', error);
            throw error;
        }
    }

    async stopRecording() {
        return new Promise((resolve, reject) => {
            if (!this.mediaRecorder || !this.isRecording) {
                reject(new Error('No recording in progress'));
                return;
            }

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                this.cleanup();
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
            this.isRecording = false;
        });
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.mediaRecorder = null;
        this.audioChunks = [];
    }
}

// Pronunciation Assessment Service
class PronunciationAssessment {
    constructor(referenceText, language = 'en-US') {
        this.referenceText = referenceText;
        this.language = language;
    }

    async assess(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('reference_text', this.referenceText);
        formData.append('language', this.language);

        const response = await fetch(`${CONFIG.API_BASE_URL}/pronunciation-assessment`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Pronunciation assessment failed: ${response.statusText}`);
        }

        return await response.json();
    }

    renderResults(results) {
        const container = document.createElement('div');
        container.className = 'pronunciation-assessment';

        // Overall scores
        const scoresHTML = `
            <div class="overall-scores">
                <h4>Overall Scores</h4>
                <div>Accuracy: ${results.AccuracyScore || 'N/A'}%</div>
                <div>Fluency: ${results.FluencyScore || 'N/A'}%</div>
                <div>Completeness: ${results.CompletenessScore || 'N/A'}%</div>
                <div>Pronunciation: ${results.PronunciationScore || 'N/A'}%</div>
            </div>
        `;

        // Word-level details
        let wordsHTML = '<h5>Words:</h5><ul class="detail-list">';
        if (results.Words && results.Words.length > 0) {
            results.Words.forEach(word => {
                const score = word.PronunciationAssessment;
                wordsHTML += `
                    <li>
                        <strong>${word.Word}</strong> 
                        (Accuracy: ${score?.AccuracyScore || 'N/A'}%)
                    </li>
                `;
            });
        } else {
            wordsHTML += '<li>No word details available.</li>';
        }
        wordsHTML += '</ul>';

        // Phoneme details
        let phonemesHTML = '<h5>Phonemes:</h5><ul class="detail-list">';
        if (results.Phonemes && results.Phonemes.length > 0) {
            results.Phonemes.forEach(phoneme => {
                const score = phoneme.PronunciationAssessment;
                phonemesHTML += `
                    <li>
                        <strong>${phoneme.Phoneme}</strong> 
                        (Accuracy: ${score?.AccuracyScore || 'N/A'}%)
                    </li>
                `;
            });
        } else {
            phonemesHTML += '<li>No phoneme details available.</li>';
        }
        phonemesHTML += '</ul>';

        container.innerHTML = scoresHTML + wordsHTML + phonemesHTML;
        return container;
    }
}

// Flashcard Manager
class FlashcardManager {
    constructor() {
        this.currentCard = null;
        this.conversationHistory = [];
    }

    async createFlashcard(prompt, apiKey = null) {
        const systemPrompt = CONFIG.SYSTEM_PROMPTS.FLASHCARD_CREATOR.replace('<<Prompt>>', prompt);
        
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        try {
            const response = await apiService.chat(messages, apiKey);
            const content = response.choices[0].message.content;
            
            // Parse JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Invalid response format');
            }

            const cardData = JSON.parse(jsonMatch[0]);
            this.currentCard = cardData;
            return cardData;
        } catch (error) {
            console.error('Error creating flashcard:', error);
            throw error;
        }
    }

    renderFlashcard(cardData) {
        return `
            <div class="flashcard">
                <div class="flashcard-front">
                    ${cardData.front}
                </div>
                <div class="flashcard-back" style="display: none;">
                    ${cardData.back}
                </div>
            </div>
        `;
    }

    flipCard(cardElement) {
        const front = cardElement.querySelector('.flashcard-front');
        const back = cardElement.querySelector('.flashcard-back');
        
        if (front.style.display !== 'none') {
            front.style.display = 'none';
            back.style.display = 'block';
        } else {
            front.style.display = 'block';
            back.style.display = 'none';
        }
    }
}

// UI Components
const UIComponents = {
    createLoadingSpinner() {
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        return spinner;
    },

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    },

    createMessageElement(content, role = 'user') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-item message-${role}`;
        messageDiv.innerHTML = content;
        return messageDiv;
    }
};

// Audio Processing Utilities
const audioUtils = {
    // Convert AudioBuffer to WAV Blob
    audioBufferToWav(audioBuffer) {
        const numberOfChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length * numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numberOfChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = length * bytesPerSample;
        const bufferSize = 44 + dataSize;

        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Helper functions
        const writeString = (str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
            offset += str.length;
        };

        const writeUint32 = (value) => {
            view.setUint32(offset, value, true);
            offset += 4;
        };

        const writeUint16 = (value) => {
            view.setUint16(offset, value, true);
            offset += 2;
        };

        const writeInt16 = (value) => {
            const clampedValue = value < 0 ? 
                Math.max(value, -32768) : 
                Math.min(value, 32767);
            view.setInt16(offset, clampedValue, true);
            offset += 2;
        };

        // RIFF header
        writeString('RIFF');
        writeUint32(bufferSize - 8);
        writeString('WAVE');
        
        // fmt chunk
        writeString('fmt ');
        writeUint32(16);
        writeUint16(1); // PCM
        writeUint16(numberOfChannels);
        writeUint32(sampleRate);
        writeUint32(byteRate);
        writeUint16(blockAlign);
        writeUint16(bitsPerSample);
        
        // data chunk
        writeString('data');
        writeUint32(dataSize);

        // Write audio data
        const channels = [];
        for (let i = 0; i < numberOfChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }

        for (let i = 0; i < audioBuffer.length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = channels[channel][i] * 32767;
                writeInt16(sample);
            }
        }

        return new Blob([view], { type: 'audio/wav' });
    },

    // Split audio into segments
    async splitAudioIntoSegments(audioBlob, segments) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const segmentBlobs = [];

            for (const segment of segments) {
                const startTime = segment.start;
                const endTime = segment.end;
                const duration = endTime - startTime;

                if (duration <= 0) {
                    console.warn(`Segment ${segment.id} has invalid duration, skipping.`);
                    continue;
                }

                const startSample = Math.floor(startTime * audioBuffer.sampleRate);
                const endSample = Math.floor(endTime * audioBuffer.sampleRate);
                const sampleLength = endSample - startSample;

                if (sampleLength <= 0) {
                    console.warn(`Segment ${segment.id} results in zero or negative sample length, skipping.`);
                    continue;
                }

                const segmentBuffer = audioContext.createBuffer(
                    audioBuffer.numberOfChannels,
                    sampleLength,
                    audioBuffer.sampleRate
                );

                for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                    const sourceData = audioBuffer.getChannelData(channel);
                    const targetData = segmentBuffer.getChannelData(channel);
                    const segmentData = sourceData.subarray(startSample, endSample);
                    targetData.set(segmentData);
                }

                const segmentBlob = this.audioBufferToWav(segmentBuffer);
                segmentBlobs.push({
                    segment: segment,
                    blob: segmentBlob
                });
            }

            return segmentBlobs;
        } catch (error) {
            console.error('Error splitting audio:', error);
            throw error;
        } finally {
            if (audioContext && audioContext.state === 'running') {
                await audioContext.close().catch(err => 
                    console.warn('Could not close AudioContext:', err)
                );
            }
        }
    },

    // Merge segments for better transcription
    mergeSegments(transcriptionResult) {
        const segments = transcriptionResult.segments;
        const mergedSegments = [];
        const minDuration = 20; // seconds
        const maxDuration = 30; // seconds

        if (!segments || segments.length === 0) {
            return { ...transcriptionResult, segments: [] };
        }

        let currentBatch = [];
        let segmentId = 0;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            currentBatch.push(segment);

            const batchStart = currentBatch[0].start;
            const batchEnd = currentBatch[currentBatch.length - 1].end;
            const batchDuration = batchEnd - batchStart;

            const isLastSegment = i === segments.length - 1;
            const nextSegment = segments[i + 1];
            const potentialDuration = nextSegment ? 
                nextSegment.end - batchStart : 
                batchDuration;

            const shouldMerge = isLastSegment || 
                batchDuration >= minDuration || 
                (batchDuration >= minDuration * 0.8 && potentialDuration > maxDuration * 1.2);

            if (shouldMerge) {
                const text = currentBatch.map(s => s.text).join(' ').trim();
                const mergedSegment = {
                    id: segmentId++,
                    start: batchStart,
                    end: batchEnd,
                    text: text,
                    seek: currentBatch[0].seek,
                    tokens: [],
                    temperature: currentBatch[0].temperature,
                    avg_logprob: currentBatch[0].avg_logprob,
                    compression_ratio: currentBatch[0].compression_ratio,
                    no_speech_prob: currentBatch[0].no_speech_prob
                };

                mergedSegments.push(mergedSegment);
                currentBatch = [];
            }
        }

        return { ...transcriptionResult, segments: mergedSegments };
    }
};

// Event Handlers
const eventHandlers = {
    // Handle keyboard shortcuts
    handleKeyPress(event) {
        // Focus input on 'J' key
        if (event.key === 'j' || event.key === 'J') {
            const input = document.getElementById('message-input');
            if (input && document.activeElement !== input) {
                event.preventDefault();
                input.focus();
            }
        }

        // Send message on Enter (without Shift)
        if (event.key === 'Enter' && !event.shiftKey) {
            const input = document.getElementById('message-input');
            if (input && document.activeElement === input) {
                event.preventDefault();
                this.handleSendMessage();
            }
        }
    },

    // Handle send message
    async handleSendMessage() {
        const input = document.getElementById('message-input');
        const messageList = document.querySelector('.message-list');
        
        if (!input || !messageList) return;

        const message = input.value.trim();
        if (!message) return;

        // Clear input
        input.value = '';

        // Add user message to UI
        const userMessage = UIComponents.createMessageElement(message, 'user');
        messageList.appendChild(userMessage);

        // Show loading
        const loadingSpinner = UIComponents.createLoadingSpinner();
        messageList.appendChild(loadingSpinner);

        try {
            // Get AI response
            const flashcardManager = new FlashcardManager();
            const cardData = await flashcardManager.createFlashcard(message);

            // Remove loading
            loadingSpinner.remove();

            // Add AI response to UI
            const cardHTML = flashcardManager.renderFlashcard(cardData);
            const aiMessage = UIComponents.createMessageElement(cardHTML, 'assistant');
            messageList.appendChild(aiMessage);

            // Scroll to bottom
            messageList.scrollTop = messageList.scrollHeight;

            // Save to database
            await apiService.saveMessage({
                user: message,
                assistant: cardData,
                timestamp: utils.getTimestamp()
            });

        } catch (error) {
            loadingSpinner.remove();
            
            if (error.message === 'DAILY_LIMIT_EXCEEDED') {
                const limitMessage = UIComponents.createMessageElement(
                    CONFIG.DAILY_LIMIT_MESSAGE, 
                    'system'
                );
                messageList.appendChild(limitMessage);
            } else {
                UIComponents.showNotification('Error: ' + error.message, 'error');
            }
        }
    }
};

// Initialization
function init() {
    console.log('Initializing Langki Anki Assistant...');

    // Add styles
    const styleElement = document.createElement('style');
    styleElement.textContent = STYLES;
    document.head.appendChild(styleElement);

    // Add event listeners
    document.addEventListener('keydown', eventHandlers.handleKeyPress.bind(eventHandlers));

    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', eventHandlers.handleSendMessage.bind(eventHandlers));
    }

    // Add credit link
    const creditLink = document.createElement('a');
    creditLink.href = 'https://langki.net';
    creditLink.className = 'langki-credit';
    creditLink.textContent = 'Powered by Langki';
    creditLink.target = '_blank';
    document.body.appendChild(creditLink);

    console.log('Langki Anki Assistant initialized successfully!');
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        utils,
        apiService,
        AudioRecorder,
        PronunciationAssessment,
        FlashcardManager,
        UIComponents,
        audioUtils,
        eventHandlers
    };
}
