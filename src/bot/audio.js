const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Transcribes audio from a WhatsApp voice message using the Groq Whisper API.
 * @param {Buffer} mediaBuffer - Raw audio data from a WhatsApp voice message.
 * @returns {Promise<string|null>} The transcribed text, or null on failure.
 */
async function transcribeAudio(mediaBuffer) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    console.warn(
      "[audio] GROQ_API_KEY not configured — audio transcription disabled."
    );
    return null;
  }

  // Write the buffer to a temporary .ogg file (WhatsApp voice format)
  const tmpFile = path.join(os.tmpdir(), `wa_audio_${Date.now()}.ogg`);

  try {
    fs.writeFileSync(tmpFile, mediaBuffer);

    // Build multipart/form-data manually using the built-in File + FormData
    const blob = new Blob([fs.readFileSync(tmpFile)], {
      type: "audio/ogg",
    });

    const form = new FormData();
    form.append("file", blob, "audio.ogg");
    form.append("model", "whisper-large-v3");
    form.append("language", "es");

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: form,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[audio] Groq API error ${response.status}: ${errorBody}`
      );
      return null;
    }

    const data = await response.json();
    return data.text || null;
  } catch (error) {
    console.error("[audio] Transcription failed:", error.message);
    return null;
  } finally {
    // Clean up the temp file
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

module.exports = { transcribeAudio };
