import Fastify from "fastify";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import fastifyMultipart from "@fastify/multipart";
import { setupTwilioRoutes } from "./twilio.js";
import { setupOpenAIWebSocket} from "./openai.js";
import { getTodayOrdersByPhone } from "./supabase.js";
import moment from "moment-timezone";
import { formatPendingOrder } from "./utils.js";

// Load environment variables from .env file
dotenv.config();

// Initialize Fastify
const fastify = Fastify({
  logger: true,
});

// Register plugins
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);
fastify.register(fastifyMultipart);

// Setup Twilio routes
setupTwilioRoutes(fastify);
// Setup OpenAI WebSocket
setupOpenAIWebSocket(fastify);

// Start the server
const PORT = process.env.PORT || 5050;
fastify.listen({ port: PORT, host: "0.0.0.0" }, async (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
  const pendingOrders = await getTodayOrdersByPhone("+12108522586");
  const lastOrder = pendingOrders[pendingOrders.length - 1];
  // console.log("Pending Orders:", pendingOrders);
  const formatted = formatPendingOrder(lastOrder);
  console.log(formatted)
});