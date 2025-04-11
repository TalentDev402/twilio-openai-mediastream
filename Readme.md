# Speech Assistant with Twilio Voice and OpenAI Realtime API

A real-time voice assistant application that enables two-way conversations between users and an AI assistant through phone calls. The application leverages Twilio's Voice and Media Streams capabilities along with OpenAI's Realtime API to create a seamless voice interaction experience.

## Features

- Real-time voice conversations with AI assistant
- WebSocket-based bidirectional audio streaming
- Integration with Twilio Voice and Media Streams
- OpenAI Realtime API integration for natural language processing
- Fast and efficient audio processing
- Support for multiple concurrent conversations

## Prerequisites

- **Node.js 18+** (Tested with v18.20.4)
- **Twilio Account** with:
  - Voice-enabled phone number
  - Account SID and Auth Token
- **OpenAI Account** with:
  - API Key
  - Access to Realtime API
- **Supabase Account** (for optional data storage)

## Installation

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd twilio-openai-mediastream
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```env
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   OPENAI_API_KEY=your_openai_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   PORT=5050
   ```

## Development Setup

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Set up ngrok for local development:
   ```bash
   ngrok http 5050
   ```
   Copy the generated ngrok URL (e.g., `https://[your-ngrok-subdomain].ngrok.app`).

3. Configure your Twilio phone number:
   - Go to [Twilio Console](https://console.twilio.com/)
   - Navigate to Phone Numbers > Manage > Active Numbers
   - Select your phone number
   - Under "A call comes in", set it to Webhook
   - Enter your ngrok URL followed by `/incoming-call`
   - Save the configuration

## Project Structure

```
.
├── index.js          # Main application entry point
├── twilio.js         # Twilio integration and routes
├── openai.js         # OpenAI Realtime API integration
├── whisper.js        # Audio processing utilities
├── supabase.js       # Database integration
├── utils.js          # Helper functions
└── package.json      # Project dependencies and scripts
```

## Usage

1. Start the application:
   ```bash
   npm start
   ```

2. Call your Twilio phone number
3. The AI assistant will greet you and begin the conversation
4. Speak naturally to interact with the assistant
5. End the call when finished

## Development

- `npm run dev`: Start the development server with hot reload
- `npm start`: Start the production server

## Dependencies

- Fastify: Web framework
- Twilio: Voice and Media Streams
- OpenAI: Realtime API
- Supabase: Database (optional)
- WebSocket: Real-time communication
- FFmpeg: Audio processing

## Contributing

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
