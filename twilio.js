/**
 * Sets up Twilio routes for handling incoming calls
 * @param {FastifyInstance} fastify - Fastify server instance
 */
export const setupTwilioRoutes = (fastify) => {
  // Route for Twilio to handle incoming calls
  fastify.all("/incoming-call", async (request, reply) => {
    const callerNumber = request.query.From;
    console.log(`[Twilio] Incoming call from: ${callerNumber}`);

    // Generate TwiML response for call handling
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Pause length="1"/>
            <Connect>
                <Stream url="wss://${request.headers.host}/media-stream">
                  <Parameter name="caller" value="${callerNumber}"/>
                </Stream>
            </Connect>
        </Response>`;
    
    reply.type("text/xml").send(twimlResponse);
  });
};