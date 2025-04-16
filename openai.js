import WebSocket from "ws";
import { deleteFileSafe, formatPendingOrder } from "./utils.js";
import dotenv from "dotenv";
import moment from "moment-timezone";
import fs from "fs";
import { addOrder, getTodayOrdersByPhone, updateOrder } from "./supabase.js";
import twilio from "twilio";
import OpenAI from "openai";
import {
  convertG711ToPCMForWhisper,
  saveG711uLawAsWav,
  transcribeAudio,
} from "./whisper.js";
import { time } from "console";

// Load environment variables
dotenv.config();

let currentCSTTime;

// Constants
const SYSTEM_MESSAGE = `
You are Tutti Da Gio's AI assistant, providing professional and courteous service for our restaurant. Your responsibilities include answering questions and processing orders according to strict guidelines.

Interaction Protocol:
1. Each conversation is independent - do not retain information between sessions
2. You cannot process payments but will text orders to the restaurant
3. No sides are currently available

Human Transfer Protocol:
If the user requests human assistance, respond:
"I understand you'd like to speak with a human. I can either:
1. Connect you with our manager, or
2. End this call
Please let me know which option you prefer."

For manager transfer: "I'll connect you with our manager now. Please hold the line."
For call ending: "Thank you for calling Tutti Da Gio. Goodbye! Have a great day!"

Restaurant Information:
■ Locations:
  - Hermitage: 5851 Old Hickory Blvd, Hermitage TN 37076 (To-go only, limited outdoor seating)
  - Hendersonville: 393 East Main Street, Hendersonville TN 37075, suite 6a (Indoor/outdoor seating)
■ Hours:
  - Tue-Wed: 4pm-9pm
  - Thu-Sat: 11am-9pm
■ Policies:
  - Reservations: Hendersonville only, parties of 10+, $25/seat minimum
  - Delivery: Online orders only via www.tuttidagio.com
  - Alcohol: Hendersonville location only
  - Hermitage patrons may take food to Shooters Bar next door

Order Processing Protocol:

If the user has existing orders today:
Before starting a new order, ask:
*"I see you already placed an order earlier today. Would you like to update your existing order, or place a brand new one?"*

If the user says "update":
→ Confirm the user name as well as previous pending order and proceed with order processing protocol below (Reference previous pending order).

If the user says "new":
→ Proceed with a fresh order using the protocol below.

If unclear:
→ Ask: *"Just to clarify, would you like to update your existing order or place a new one?"*

1. Information Collection (REQUIRED FIELDS):
   a) Customer Name:
      - Must obtain valid human name
      - Repeat request until valid name provided
   
   b) Food Items:
      - Verify all items exist on menu
      - Accept modifications if explicitly stated
      - Confirm no additional items before proceeding
      - Example ordering methods:
        • By name: "I want Margherita pizza"
        • By ingredient: "I want pizza with cheese and basil" → Margherita
        • By characteristic: "I want something with vegetables" → Alicuti

   c) Location:
      - Hendersonville or Hermitage only
      - Note location-specific differences:
        • Indoor dining: Hendersonville only
        • Beverages: Pepsi (Hendersonville), Coke (Hermitage)

   d) Time:
      - Must be current day during operating hours
      - Acceptable formats:
        • Specific time (verify within hours)
        • Duration from now (calculate and verify)
      - Reject invalid times with operating hour reminder

2. Location Information Handling:
   If the user requests details about a specific location:  
    - **For Hendersonville:**  
    Respond: *"I'll text you the complete location details for Hendersonville shortly. This may take a moment, so please continue with your order in the meantime."*  
    - **For Hermitage:**  
    Respond: *"I'll text you the complete location details for Hermitage shortly. This may take a moment, so please continue with your order in the meantime."*  

3. Order Confirmation:
   a) Verification:
      - Ensure all required fields are complete and valid
      - Return to incomplete/missing information

   b) Confirmation Sequence:
      1. Alert: "Please listen carefully to the entire confirmation"
      2. Recite:
         • Customer name
         • Itemized order (quantities, prices)
         • Total (pre-tax)
         • Location
         • Time
      3. Verify: "Does this complete your order?"
      4. Handle modifications by restarting confirmation
      5. Repeat until explicit confirmation

4. Order Completion:
   Upon confirmation: "Your order is complete! Goodbye and [appropriate closing remark]"

Special Notes:
■ Allergen Warning: "We cannot guarantee against cross-contamination. We use gluten, tree nuts, onions, and other common allergens. Not recommended for those with severe allergies."
■ Time Estimates:
  - 5:00pm-7:30pm: 30-45 minute wait
  - Other times: 10-20 minute wait
■ Scope Limitation: "I can only assist with restaurant-related questions and menu items. How can I help you?"

Menu Summary (Full details in original prompt):
1) Antipasto (Appetizers) / Insalata (Salads)
 - Arancini (Fried Rice Ball): Ragu and mozzarella cheese encased in an arborio rice ball, hand-rolled in Sicilian bread crumbs, and deep-fried to perfection. - $6
 - Caprese (Mozzarella and Tomatoes): Thick slices of tomatoes and soft, fresh mozzarella with olive oil, decorated with balsamic glaze. - $12
 - Parmigiana (Eggplant and Mozzarella): Layers of fried eggplant slices with basil, mozzarella, and sliced egg covered with homemade tomato sauce. - $14
 - Vulcano Insalata (Side / Full Serving): Tomatoes, cucumbers, capers, black olives, onion, and romaine lettuce with house-made dressing. - $6 / $10
2) Contorni (Sides)
 - Polpette Pomodoro (Meatballs and Sauce): Giovanna's house-made meatballs in marinara, decorated with parmesan cheese and herbs. - $12
 - Gamberi con Aglio e Burro (Shrimp, Garlic, Butter): Shrimp cooked with garlic, butter, and herbs. - $9
3) Panini (Italian Sandwiches)
 - Alicuti (Italian Ham and Pickled Vegetables): Fresh oven-baked bread filled with romaine lettuce, prosciutto cotto, mozzarella, tomatoes, and pickled Italian vegetables. - $17
 - Lipari (Prosciutto, Arugula, Mozzarella): Homemade bread filled with prosciutto crudo, fresh mozzarella, arugula, and tomatoes. - $18
 - Polpette (Meatballs, Mozzarella): Oven-baked bread filled with handmade meatballs, mozzarella, and parmesan cheese, baked to perfection. - $18
4) Pizze (Red Pizza - 12" Brick Oven)
 - Margherita (Cheese and Basil): Fresh mozzarella over basil and simple tomato sauce. - $15
 - Diavola (Pepperoni and Cheese): Fresh mozzarella and pepperoni over simple tomato sauce. - $17
 - Capricciosa (Artichoke & Italian Ham): Fior di latte mozzarella, artichoke hearts, mushrooms, olives, and prosciutto cotto over tomato sauce. - $18
 - Norma (Eggplant and Ricotta): Fresh mozzarella, eggplant, and baked ricotta over tomato sauce. - $16
 - Soppressata (Dry Salami): Parmesan, basil, soppressata, mozzarella, and tomato sauce. - $17
 - Calzone (Pizza Pie): Prosciutto cotto, mushrooms, mozzarella, and tomato sauce folded inside a pizza. - $17
5) Pizze Bianche (White Pizza - 12" Brick Oven)
 - Parma (Prosciutto, Arugula): Fresh mozzarella, cherry tomatoes, prosciutto crudo, arugula, and aged parmesan flakes. - $20
 - Quattro Formaggi (Four Cheese): Fresh mozzarella, asiago, gorgonzola, and parmesan. - $17
 - Salsicce e Patate (Sausage, Potato): Fresh mozzarella, sausage, and roasted potatoes garnished with rosemary. - $18
6) Bambino (Kids Menu)
 - Pasta al Burro (Pasta with Butter): Spaghetti with a little bit of butter. - $6
 - Bambino Pomodoro (Pasta, Marinara): Spaghetti in tomato sauce. - $8
 - Bambino Formaggio (Pasta, Cheese): Fusilli with a parmesan and mozzarella sauce. - $9
 - Bambino Polpette (Pasta, Meatballs): Spaghetti with meatballs and tomato sauce. - $10
7) Primi (Entrees)
 - Sicilian Lasagna (Lasagna with Eggplant): Traditional Sicilian lasagna with pasta, eggplant, prosciutto cotto, ragu, mozzarella, and bechamel with hard-boiled eggs. - $19
 - Pasta Aglio e Olio (Olive Oil and Peppers): Spaghetti with garlic, oil, parsley, cherry tomatoes, and red peppers. - $13
 - Pasta al Pomodoro (Marinara): House-made spaghetti in marinara sauce. - $12
 - Pasta alla Norma (Eggplant and Ricotta): House-made tomato sauce, eggplant, baked ricotta, and basil over caserecce. - $15
 - Pasta al Sugo con Polpette (Meatballs): House-made meatballs, tomato sauce, basil, and parmesan over spaghetti. - $17
 - Pasta alla Giovannina (Meat Ragu): House-made ragu over tagliatelle, decorated with parmesan. - $16
 - Tortellini con Prosciutto e Panna (Italian Ham): Prosciutto cotto and parmesan cream sauce over cheese tortellini. - $18
 - Gnocchi ai Pesto (Basil Pesto and Cream): Basil pesto cream with pistachio shavings over gnocchi. - $17
 - Gnocchi ai Quattro Formaggi (Four Cheese): Mozzarella, asiago, gorgonzola, and  - pecorino with fried prosciutto over gnocchi. - $17
 - Gnocchi con Gamberi e Zaffrano (Shrimp and Saffron): Saffron cream with shrimp and gnocchi. - $18
 - Pasta ai Gamberi e Zucchine (Shrimp and Zucchini): Fried zucchini and shrimp in garlic butter sauce over fusilli. - $19
 - Pasta al Salmone (Smoked Salmon and Cream): Smoked salmon, cherry tomatoes, parsley, and creamy cheese sauce over fusilli. - $19
 - Pasta alle Vongole (Clams and White Wine): White wine cream sauce over tagliatelle and clams, decorated with parsley. - $19
8) Dolce (Desserts)
 - Bianco e Nero: Vanilla cream puffs with Nutella mousse and chocolate shavings. - $6
 - Cannolo: Fried pastry shells filled with ricotta cheese, pistachio, and confectioner's sugar. - $6
 - Tiramisu: Mascarpone cream and ladyfingers soaked in coffee with chocolate sprinkles. - $6
 - Panna Cotta: Italian custard with chocolate, caramel, or strawberry sauce. - $6
9) Bevande (Beverages)
 - Bottled Water - $2
 - Pepsi Products (Bottled) - $3 (Hendersonville location only)
 - Coke Products (Bottled) - $3 (Hermitage location only)
 - Sparkling Water (Bottled) - $3
 - San Pellegrino Flavors - $3
 - Espresso - $3

Tax: 6.75% added to all orders
`;
const SYSTEM_MESSAGE_FOR_JSON = `
You are a helpful assistant to be designed to generate a successful json object from the conversation between user and bot.
Plz generate a json object with user's name, phone number, ordering foods, location and ordering time.
Carefully analyze the conversation to see if the order has been confirmed, and if so, set isOrdered field to true, if not set false.
If the order has been confirmed, then generate user's name, ordering foods, location, ordering time, total price from the conversation(based on the last confirmation message or last confirmed content(name, foods, time) which the user has confirmed).

Field Names:
name, phone, foods, location, time, totalPrice, isOrdered, isUpdate

Behavior Rules:
- **isUpdate**: Set to true if the conversation clearly indicates that the user is updating a previous order (e.g., modifying items, time, or location of a prior order).
  Otherwise, set to false.  
    To determine this:
    - Look for language like “change”, “modify”, “update”, “add to previous order” → set isUpdate = true
    - Language like “place a new order”, “start over”, or no reference to prior orders → set isUpdate = false
  Default value is false unless user explicitly indicates the intention to update a prior order.  
  If it's a new order, leave isUpdate as false.

For generating ordering time, follow this guidline:
    - If given a user request specifying a time duration (e.g., 'I want to have it after 30 minutes from now'), calculate the exact order time. (Ordering time = Current time + Time duration) 
    - Format the output as a 24-hour time (HH:MM AM/PM).

For generating location field, analyze the conversation to determine which location the user has chosen or discussed.
If the location is explicitly mentioned or can be inferred from the conversation (e.g., discussing indoor dining which is only available in Hendersonville), set the location accordingly.
If no location is clearly specified in the conversation, set location as "Hermitage".
    Valid location values:
      - "Hendersonville"
      - "Hermitage"


When generating ordering foods, time and total price, must based on last bot's confirmation message that the user confirmed or agreed.

When generating foods field, reference below menu(If there are any modify or special note for the food, then must mention all modify and special note for the food.).
Keep in mind to mention the count and price of each food.
If the count of food is 1, the price is the original price of the food in the menu.
If the count of food is more than 1, the price is equal to the count multiply original price of the food in the menu.
    Example:
        1 Arancini($6), 1 Caprese($12), 2 Parmigianas($28 - because the price of one Parmigiana is $14 and the count is 2, so the price is $28)
For multiple foods the user requires, then separate each food by ",".
This below menu is foods menu so the foods must be items in the menu.
Menu
1) Antipasto (Appetizers) / Insalata (Salads)
 - Arancini (Fried Rice Ball): Ragu and mozzarella cheese encased in an arborio rice ball, hand-rolled in Sicilian bread crumbs, and deep-fried to perfection. - $6
 - Caprese (Mozzarella and Tomatoes): Thick slices of tomatoes and soft, fresh mozzarella with olive oil, decorated with balsamic glaze. - $12
 - Parmigiana (Eggplant and Mozzarella): Layers of fried eggplant slices with basil, mozzarella, and sliced egg covered with homemade tomato sauce. - $14
 - Vulcano Insalata (Side / Full Serving): Tomatoes, cucumbers, capers, black olives, onion, and romaine lettuce with house-made dressing. - $6 / $10
2) Contorni (Sides)
 - Polpette Pomodoro (Meatballs and Sauce): Giovanna's house-made meatballs in marinara, decorated with parmesan cheese and herbs. - $12
 - Gamberi con Aglio e Burro (Shrimp, Garlic, Butter): Shrimp cooked with garlic, butter, and herbs. - $9
3) Panini (Italian Sandwiches)
 - Alicuti (Italian Ham and Pickled Vegetables): Fresh oven-baked bread filled with romaine lettuce, prosciutto cotto, mozzarella, tomatoes, and pickled Italian vegetables. - $17
 - Lipari (Prosciutto, Arugula, Mozzarella): Homemade bread filled with prosciutto crudo, fresh mozzarella, arugula, and tomatoes. - $18
 - Polpette (Meatballs, Mozzarella): Oven-baked bread filled with handmade meatballs, mozzarella, and parmesan cheese, baked to perfection. - $18
4) Pizze (Red Pizza - 12" Brick Oven)
- Diavola (Pepperoni and Cheese): Fresh mozzarella and pepperoni over simple tomato sauce. - $17
- Margherita (Cheese and Basil): Fresh mozzarella over basil and simple tomato sauce. - $15
 - Capricciosa (Artichoke & Italian Ham): Fior di latte mozzarella, artichoke hearts, mushrooms, olives, and prosciutto cotto over tomato sauce. - $18
 - Norma (Eggplant and Ricotta): Fresh mozzarella, eggplant, and baked ricotta over tomato sauce. - $16
 - Soppressata (Dry Salami): Parmesan, basil, soppressata, mozzarella, and tomato sauce. - $17
 - Calzone (Pizza Pie): Prosciutto cotto, mushrooms, mozzarella, and tomato sauce folded inside a pizza. - $17
5) Pizze Bianche (White Pizza - 12" Brick Oven)
 - Parma (Prosciutto, Arugula): Fresh mozzarella, cherry tomatoes, prosciutto crudo, arugula, and aged parmesan flakes. - $20
 - Quattro Formaggi (Four Cheese): Fresh mozzarella, asiago, gorgonzola, and parmesan. - $17
 - Salsicce e Patate (Sausage, Potato): Fresh mozzarella, sausage, and roasted potatoes garnished with rosemary. - $18
6) Bambino (Kids Menu)
 - Pasta al Burro (Pasta with Butter): Spaghetti with a little bit of butter. - $6
 - Bambino Pomodoro (Pasta, Marinara): Spaghetti in tomato sauce. - $8
 - Bambino Formaggio (Pasta, Cheese): Fusilli with a parmesan and mozzarella sauce. - $9
 - Bambino Polpette (Pasta, Meatballs): Spaghetti with meatballs and tomato sauce. - $10
7) Primi (Entrees)
 - Sicilian Lasagna (Lasagna with Eggplant): Traditional Sicilian lasagna with pasta, eggplant, prosciutto cotto, ragu, mozzarella, and bechamel with hard-boiled eggs. - $19
 - Pasta Aglio e Olio (Olive Oil and Peppers): Spaghetti with garlic, oil, parsley, cherry tomatoes, and red peppers. - $13
 - Pasta al Pomodoro (Marinara): House-made spaghetti in marinara sauce. - $12
 - Pasta alla Norma (Eggplant and Ricotta): House-made tomato sauce, eggplant, baked ricotta, and basil over caserecce. - $15
 - Pasta al Sugo con Polpette (Meatballs): House-made meatballs, tomato sauce, basil, and parmesan over spaghetti. - $17
 - Pasta alla Giovannina (Meat Ragu): House-made ragu over tagliatelle, decorated with parmesan. - $16
 - Tortellini con Prosciutto e Panna (Italian Ham): Prosciutto cotto and parmesan cream sauce over cheese tortellini. - $18
 - Gnocchi ai Pesto (Basil Pesto and Cream): Basil pesto cream with pistachio shavings over gnocchi. - $17
 - Gnocchi ai Quattro Formaggi (Four Cheese): Mozzarella, asiago, gorgonzola, and  - pecorino with fried prosciutto over gnocchi. - $17
 - Gnocchi con Gamberi e Zaffrano (Shrimp and Saffron): Saffron cream with shrimp and gnocchi. - $18
 - Pasta ai Gamberi e Zucchine (Shrimp and Zucchini): Fried zucchini and shrimp in garlic butter sauce over fusilli. - $19
 - Pasta al Salmone (Smoked Salmon and Cream): Smoked salmon, cherry tomatoes, parsley, and creamy cheese sauce over fusilli. - $19
 - Pasta alle Vongole (Clams and White Wine): White wine cream sauce over tagliatelle and clams, decorated with parsley. - $19
8) Dolce (Desserts) 
 - Bianco e Nero: Vanilla cream puffs with Nutella mousse and chocolate shavings. - $6
 - Cannolo: Fried pastry shells filled with ricotta cheese, pistachio, and confectioner's sugar. - $6
 - Tiramisu: Mascarpone cream and ladyfingers soaked in coffee with chocolate sprinkles. - $6
 - Panna Cotta: Italian custard with chocolate, caramel, or strawberry sauce. - $6
9) Bevande (Beverages)
 - Bottled Water - $2
 - Pepsi Products (Bottled) - $3 (Hendersonville location only)
 - Coke Products (Bottled) - $3 (Hermitage location only)
 - Sparkling Water (Bottled) - $3
 - San Pellegrino Flavors - $3
 - Espresso - $3
`;

const managerNumber = process.env.MANAGER_NUMBER;
const messagingServiceSid = process.env.MESSAGING_SERVICE_SID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

/**
 * Sends SMS notifications to both customer and manager
 * @param {string} content - Message content for customer
 * @param {string} contentToManager - Message content for manager
 * @param {string} callerNumber - Customer's phone number
 */
const sendingSMS = async (content, contentToManager, callerNumber) => {
  try {
    if (content) {
      const message = await client.messages.create({
        body: content,
        messagingServiceSid: messagingServiceSid,
        to: callerNumber,
      });
      console.log(`[SMS] Sent to customer ${callerNumber}: ${message.body}`);
    }
    if (contentToManager) {
      const messageToManager = await client.messages.create({
        body: contentToManager,
        messagingServiceSid: messagingServiceSid,
        to: managerNumber,
      });
      console.log(`[SMS] Sent to manager: ${messageToManager.body}`);
    }
  } catch (error) {
    console.error(`[SMS] Error sending messages: ${error.message}`);
  }
};

/**
 * Processes chat history and generates JSON order data
 * @param {string} chatHistory - Conversation history
 * @param {string} callerNumber - Customer's phone number
 * @returns {Promise<Object>} - Parsed order data
 */
const handleHistory = async (chatHistory, callerNumber) => {
  const currentCSTTime = moment().tz("America/Chicago").format("HH:mm:ss");
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-1106",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: SYSTEM_MESSAGE_FOR_JSON + "Current Time: " + currentCSTTime,
        },
        {
          role: "user",
          content: chatHistory + "Phone Number: " + callerNumber,
        },
      ],
    });
    return completion.choices[0].message.content;
  } catch (error) {
    console.error(`[OpenAI] Error processing chat history: ${error.message}`);
    throw error;
  }
};

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export const setupOpenAIWebSocket = (fastify) => {
  fastify.register(async (fastify) => {
    fastify.get("/media-stream", { websocket: true }, (connection, req) => {
      // WebSocket state variables
      let streamSid = null;
      let latestMediaTimestamp = 0;
      let lastAssistantItem = null;
      let markQueue = [];
      let responseStartTimestampTwilio = null;
      let callerNumber;
      let chatHistory = "";
      let shouldTransferToManager = false;
      let callSid = null;
      let pendingOrders;
      currentCSTTime = moment().tz("America/Chicago").format("hh:mm A");

      // Initialize OpenAI WebSocket connection
      const openAiWs = new WebSocket(
        "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "OpenAI-Beta": "realtime=v1",
          },
        }
      );

      openAiWs.on("open", () => {
        console.log("[WebSocket] Connected to OpenAI Realtime API");
        setTimeout(initializeSession, 100);
      });

      const initializeSession = () => {
        const sessionUpdate = {
          type: "session.update",
          session: {
            turn_detection: { type: "server_vad" },
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: "sage",
            instructions:
              SYSTEM_MESSAGE +
              "Current Time: " +
              currentCSTTime +
              ". Please keep your responses concise and limit them to 4096 tokens.",
            modalities: ["text", "audio"],
            temperature: 1,
          },
        };

        openAiWs.send(JSON.stringify(sessionUpdate));
        sendInitialConversationItem();
      };

      const sendInitialConversationItem = () => {
        const initialConversationItem = {
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: 'Greet the user with "Hello there! Thank you for calling Tutti Da Gio, I am your friendly virtual assistant here to take your order or to answer your questions. If at any point you would like to speak with our manager, simply press 0 or say connect me to the manager. What can I do for you today?"',
              },
            ],
          },
        };

        openAiWs.send(JSON.stringify(initialConversationItem));
        openAiWs.send(JSON.stringify({ type: "response.create" }));
      };

      const handleSpeechStartedEvent = () => {
        if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
          const elapsedTime =
            latestMediaTimestamp - responseStartTimestampTwilio;

          if (lastAssistantItem) {
            const truncateEvent = {
              type: "conversation.item.truncate",
              item_id: lastAssistantItem,
              content_index: 0,
              audio_end_ms: elapsedTime,
            };
            openAiWs.send(JSON.stringify(truncateEvent));
          }

          connection.send(
            JSON.stringify({
              event: "clear",
              streamSid: streamSid,
            })
          );

          markQueue = [];
          lastAssistantItem = null;
          responseStartTimestampTwilio = null;
        }
      };

      const sendMark = (connection, streamSid) => {
        if (streamSid) {
          const markEvent = {
            event: "mark",
            streamSid: streamSid,
            mark: { name: "responsePart" },
          };
          connection.send(JSON.stringify(markEvent));
          markQueue.push("responsePart");
        }
      };

      let lastOpenAIMessage = null; // Variable to store the last OpenAI message
      let userInactivityTimeout = null; // Timer to detect user inactivity
      let isWaitingForResponse = false; // Flag to track if we're waiting for user response after repeat

      const handleUserInactivity = () => {
        if (openAiWs.readyState === WebSocket.CLOSED) return;

        // Clear existing timeout
        if (userInactivityTimeout) {
          clearTimeout(userInactivityTimeout);
        }

        // Only set new timeout if we're not already waiting for a response
        if (!isWaitingForResponse) {
          userInactivityTimeout = setTimeout(() => {
            if (lastOpenAIMessage) {
              // First timeout: Repeat the last message
              const message = {
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `Tell the user again your last saying: ${lastOpenAIMessage}`,
                    },
                  ],
                },
              };
              openAiWs.send(JSON.stringify(message));
              openAiWs.send(JSON.stringify({ type: "response.create" }));

              console.log(
                "No user input... Repeating the last message from OpenAI"
              );

              // Set the waiting flag
              isWaitingForResponse = true;

              // Wait for 3 seconds after the message is repeated
              setTimeout(() => {
                if (isWaitingForResponse) {
                  // If still no response after 3 seconds
                  const endMessage = {
                    type: "conversation.item.create",
                    item: {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Tell the user like this: "I haven't heard from you in a while, so I'll end our conversation now. Goodbye! Have a great day!"`,
                        },
                      ],
                    },
                  };
                  openAiWs.send(JSON.stringify(endMessage));
                  openAiWs.send(JSON.stringify({ type: "response.create" }));

                  console.log("Still no user input... Ending conversation");
                }
              }, 16000);
            }
          }, 8000); // Initial inactivity threshold
        }
      };

      let botBuffer = Buffer.alloc(0);

      openAiWs.on("message", async (data) => {
        try {
          const response = JSON.parse(data);
          if (response.type === "response.audio.done") {
            if (botBuffer.length !== 0) {
              const botBufferToProcess = Buffer.from(botBuffer);
              botBuffer = Buffer.alloc(0);
              try {
                saveG711uLawAsWav(
                  botBufferToProcess,
                  `${callerNumber}_temp.wav`
                );
                convertG711ToPCMForWhisper(
                  `${callerNumber}_temp.wav`,
                  `${callerNumber}_temp_pcm.wav`
                );
                const transcription = await transcribeAudio(
                  `${callerNumber}_temp_pcm.wav`
                );

                console.log(
                  `******OpenAI response finished with ${callerNumber}: *******` + transcription
                );
                chatHistory += "bot:" + transcription + "\n";
                lastOpenAIMessage = transcription;

                handleUserInactivity();

                // Check if we need to transfer to manager
                if (shouldTransferToManager || transcription.toLowerCase().includes("connect you with our manager")) {
                  console.log("Initiating transfer to manager...");
                  try {
                    // Update the call with transfer TwiML using Twilio REST API
                    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
                      <Response>
                        <Dial callerId="${twilioPhoneNumber}">${managerNumber}</Dial>
                      </Response>`;

                    // Update the call with the transfer TwiML
                    await client.calls(callSid).update({
                      twiml: twimlResponse
                    });

                    console.log("Call transfer initiated to manager");
                  } catch (error) {
                    console.error("Error during call transfer:", error);
                  }
                  return;
                }

                if (transcription.toLowerCase().includes("text you")) {
                  console.log("The user requested for specific location...");
                  if (transcription.toLowerCase().includes("hendersonville")) {
                    sendingSMS("Location details of Hendersonville: 393 East Main Street, Hendersonville TN 37075, suite 6a", "", callerNumber)
                  }
                  if (transcription.toLowerCase().includes("hermitage")) {
                    sendingSMS("Location details of Hermitage: 5851 Old Hickory Blvd, Hermitage TN 37076", "", callerNumber)
                  }
                }
                if (transcription.toLowerCase().includes("goodbye")) {
                  console.log("Goodbye signal detected. Ending call...");
                  setTimeout(() => {
                    console.log("Closing connection...");
                    connection.close(1000, "Normal closure");
                  }, 12000);
                }
              } catch (error) {
                console.error("Error during transcription:", error);
              }
            }
          }

          if (response.type === "response.audio.delta" && response.delta) {
            const buffer = Buffer.from(response.delta, "base64");
            botBuffer = Buffer.concat([botBuffer, buffer]);

            handleUserInactivity();
            const audioDelta = {
              event: "media",
              streamSid: streamSid,
              media: {
                payload: Buffer.from(response.delta, "base64").toString(
                  "base64"
                ),
              },
            };

            connection.send(JSON.stringify(audioDelta));

            if (!responseStartTimestampTwilio) {
              responseStartTimestampTwilio = latestMediaTimestamp;
            }

            if (response.item_id) {
              lastAssistantItem = response.item_id;
            }

            sendMark(connection, streamSid);
          }

          if (response.type === "input_audio_buffer.speech_started") {
            handleSpeechStartedEvent();
            isWaitingForResponse = false; // Reset the waiting flag when user speaks
            handleUserInactivity();
          }
        } catch (error) {
          console.error(
            "Error processing OpenAI message:",
            error,
            "Raw message:",
            data
          );
        }
      });

      connection.on("message", async (message) => {
        try {
          const data = JSON.parse(message);

          switch (data.event) {
            case "media":
              latestMediaTimestamp = data.media.timestamp;

              if (openAiWs.readyState === WebSocket.OPEN) {
                const audioAppend = {
                  type: "input_audio_buffer.append",
                  audio: data.media.payload,
                };
                openAiWs.send(JSON.stringify(audioAppend));
              }
              break;
            case "start":
              streamSid = data.start.streamSid;
              callerNumber = data.start.customParameters.caller;
              callSid = data.start.callSid;
              responseStartTimestampTwilio = null;
              latestMediaTimestamp = 0;
              pendingOrders = await getTodayOrdersByPhone(callerNumber);

              if (pendingOrders?.length > 0) {
                const lastOrder = pendingOrders[pendingOrders.length - 1];
                const formattedLastOrder = formatPendingOrder(lastOrder);
                console.log(formattedLastOrder)
                const contextInjection = {
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "user",
                    content: [
                      {
                        type: "input_text",
                        text: `Note: Here are the previous order from the caller: ${formattedLastOrder}`,
                      },
                    ],
                  },
                };
                openAiWs.send(JSON.stringify(contextInjection));
              }
              break;
            case "mark":
              if (markQueue.length > 0) {
                handleUserInactivity();
                markQueue.shift();
              }
              break;
            case "dtmf":
              // Handle DTMF input - only '0' key press transfers to manager
              if (data.dtmf.digit === '0') {
                console.log("DTMF 0 received, transferring to manager");
                shouldTransferToManager = true;

                // First, let OpenAI say the transfer message
                const transferMessage = {
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "user",
                    content: [
                      {
                        type: "input_text",
                        text: "Tell the user: 'I'll connect you with our manager now. Please hold the line.'",
                      },
                    ],
                  },
                };
                openAiWs.send(JSON.stringify(transferMessage));
                openAiWs.send(JSON.stringify({ type: "response.create" }));
              }
              break;
            default:
              console.log("Received non-media event:");
              break;
          }
        } catch (error) {
          console.error("Error parsing message:", error, "Message:", message);
        }
      });

      connection.on("close", async () => {
        if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();

        deleteFileSafe(`${callerNumber}_temp.wav`);
        deleteFileSafe(`${callerNumber}_temp_pcm.wav`);

        try {
          // If user connected with manager, then not handle history.
          if (shouldTransferToManager) {
            await sendingSMS(`You requested to connect the call to the manager...
              So your order is not confirmed yet.`)
            return;
          }

          const jsonResponse = await handleHistory(chatHistory, callerNumber);
          const jsonData = JSON.parse(jsonResponse);

          if (
            !jsonData.hasOwnProperty("isOrdered") ||
            (jsonData.hasOwnProperty("isOrdered") &&
              jsonData.isOrdered == false)
          ) {
            console.log("Order is not confirmed.");
            return;
          }
          console.log("Sending SMS...");
          await sendingSMS(
            `Dear ${jsonData.name},\nWe are pleased to inform you that your order of ${jsonData.foods} has been successfully processed.\nThe total price of your order is ${jsonData.totalPrice} and your food will be prepared at ${jsonData.time} in ${jsonData.location} as requested.\n\nLocation Details:\n${jsonData.location === 'Hendersonville' ? '393 East Main Street, Hendersonville TN 37075, suite 6a' : '5851 Old Hickory Blvd, Hermitage TN 37076 next to Shooters bar and Z-Mart'}\n\nWe hope you enjoy your meal and have a wonderful experience.\nShould you have any questions or need further assistance, please don't hesitate to reach out.\nThank you for choosing us. We look forward to serving you again in the future.\nWarm Regards.`,
            `${jsonData.name}(Contact Number: ${callerNumber}) ordered ${jsonData.foods}. The total price of this order is ${jsonData.totalPrice} and this will must be prepared until ${jsonData.time} in ${jsonData.location} (${jsonData.location === 'Hendersonville' ? '393 East Main Street, Hendersonville TN 37075, suite 6a' : '5851 Old Hickory Blvd, Hermitage TN 37076 next to Shooters bar and Z-Mart'}).`, callerNumber
          );
          if (jsonData.isUpdate == true) {
            const orderToUpdate = pendingOrders[pendingOrders.length - 1];
            updateOrder(orderToUpdate, jsonData.foods, jsonData.time, jsonData.location, jsonData.totalPrice)

          } else {
            addOrder(jsonData.name, callerNumber, jsonData.foods, jsonData.location, jsonData.time, jsonData.totalPrice);
          }

          fs.writeFileSync("output.json", JSON.stringify(jsonData, null, 2));
        } catch (error) {
          console.error("Error:", error);
        }
      });

      openAiWs.on("close", () => {
        console.log("[WebSocket] Disconnected from OpenAI Realtime API");
      });

      openAiWs.on("error", (error) => {
        console.error(`[WebSocket] Error: ${error.message}`);
      });
    });
  });
};