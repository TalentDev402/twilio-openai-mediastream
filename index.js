import Fastify from "fastify";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import fastifyMultipart from "@fastify/multipart";
import { setupTwilioRoutes } from "./twilio.js";
import { setupOpenAIWebSocket} from "./openai.js";
import { getTodayOrdersByPhone } from "./supabase.js";
import moment from "moment-timezone";

// Load environment variables from .env file
dotenv.config();

// Initialize Fastify
const fastify = Fastify({
  logger: true,
});

function formatPendingOrders(orders) {
  return orders
    .map((order, idx) => {
      return `#${idx + 1}: Ordered ${order.foods} at ${moment(order.updated_at).utc().format("hh:mm A")} to be ready for pick up at ${order.time}, location: ${order.location}, total: ${order.price}`;
    })
    .join(" | ");
}

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
  const formatted = formatPendingOrders(pendingOrders);
  console.log(formatted)
});