import fs from "fs";
import OpenAI from "openai";
import dotenv from "dotenv";
import { exec } from "child_process";

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Creates a WAV header for G.711 u-law audio format
 * @param {number} numSamples - Number of audio samples
 * @param {number} sampleRate - Sample rate in Hz (default: 8000)
 * @returns {Buffer} - WAV header buffer
 */
const createWavHeader = (numSamples, sampleRate = 8000) => {
  const numChannels = 1; // Mono audio
  const byteRate = sampleRate * numChannels;
  const blockAlign = numChannels;

  const buffer = Buffer.alloc(44);
  // Write WAV header fields
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(7, 20); // AudioFormat (7 = G.711 u-law)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(8, 34); // BitsPerSample (8 bits for u-law)
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples, 40);

  return buffer;
};

/**
 * Saves G.711 u-law audio buffer as WAV file
 * @param {Buffer} audioBuffer - Audio data buffer
 * @param {string} outputFilePath - Output file path
 */
export const saveG711uLawAsWav = (audioBuffer, outputFilePath) => {
  try {
    const wavHeader = createWavHeader(audioBuffer.length);
    const wavBuffer = Buffer.concat([wavHeader, audioBuffer]);
    fs.writeFileSync(outputFilePath, wavBuffer);
    // console.log(`[Audio] Saved G.711 u-law audio as WAV: ${outputFilePath}`);
  } catch (error) {
    // console.error(`[Audio] Error saving WAV file: ${error.message}`);
    throw error;
  }
};

/**
 * Converts G.711 u-law audio to PCM format for Whisper
 * @param {string} inputFile - Input WAV file path
 * @param {string} outputFile - Output PCM file path
 */
export const convertG711ToPCMForWhisper = (inputFile, outputFile) => {
  const command = `ffmpeg -y -i ${inputFile} -acodec pcm_s16le -ar 16000 ${outputFile}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      // console.error(`[Audio] Conversion error: ${error.message}`);
      throw error;
    }
    // console.log(`[Audio] Converted to PCM WAV for Whisper: ${outputFile}`);
  });
};

/**
 * Transcribes audio using OpenAI's Whisper model
 * @param {string} filePath - Path to audio file
 * @returns {Promise<string>} - Transcription text
 */
export async function transcribeAudio(filePath) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const response = await openai.audio.transcriptions.create({
          model: "whisper-1",
          file: fs.createReadStream(filePath)
        });

        // console.log(`[Whisper] Successfully transcribed audio: ${filePath}`);
        resolve(response.text);
      } catch (error) {
        // console.error(`[Whisper] Error transcribing audio: ${error.message}`);
        reject(error);
      }
    }, 2000);
  });
}