import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import moment from "moment";


// Load environment variables
dotenv.config();

// Supabase configuration
const { SUPABASE_URL, SUPABASE_KEY } = process.env;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Adds a new order to the Supabase database
 * @param {string} name - Customer name
 * @param {string} phone - Customer phone number
 * @param {string} foods - Ordered food items
 * @param {string} location - Restaurant location
 * @param {string} time - Order time
 * @param {number} price - Total price
 * @returns {Promise<void>}
 */
export async function addOrder(name, phone, foods, location, time, price) {
  try {
    // Insert order data into the database
    const { data, error } = await supabase
      .from("orders")
      .insert([
        {
          name,
          phone,
          foods,
          location,
          price,
          time,
        },
      ])
      .select();

    if (error) {
      console.error(`[Supabase] Error adding order: ${error.message}`);
      throw error;
    }

    const insertedId = data[0]?.id;
    console.log(`[Supabase] Order added successfully. ID: ${insertedId}`);
  } catch (error) {
    console.error(`[Supabase] Unexpected error: ${error.message}`);
    throw error;
  }
}

/**
 * Updates an existing order in the Supabase database
 * @param {object} oldOrder - The existing order object (must include ID)
 * @param {string} foods - Updated food items
 * @param {string} time - Updated time
 * @param {string} location - Updated location
 * @param {number} price - Updated price
 * @returns {Promise<void>}
 */
export async function updateOrder(oldOrder, foods, time, location, price) {
  try {
    const orderId = oldOrder?.id;

    if (!orderId) {
      throw new Error("Invalid order object: missing ID");
    }

    const { data, error } = await supabase
      .from("orders")
      .update({
        foods,
        time,
        location,
        price,
      })
      .eq("id", orderId)
      .select();

    if (error) {
      console.error(`[Supabase] Error updating order ID ${orderId}: ${error.message}`);
      throw error;
    }

    console.log(`[Supabase] Order updated successfully. ID: ${orderId}`);
  } catch (error) {
    console.error(`[Supabase] Unexpected error during update: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches all orders placed today
 * @returns {Promise<Array>} - List of today's orders
 */
export async function getTodayOrders() {
  try {
    const startOfDay = moment().utc().startOf("day").toISOString();
    const endOfDay = moment().utc().endOf("day").toISOString();
    console.log(startOfDay, endOfDay)

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .gte("updated_at", startOfDay)
      .lte("updated_at", endOfDay)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(`[Supabase] Error fetching today's orders: ${error.message}`);
      throw error;
    }

    return data;
  } catch (error) {
    console.error(`[Supabase] Unexpected error in getTodayOrders: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches today's orders for a specific phone number
 * @param {string} phone - Customer's phone number
 * @returns {Promise<Array>} - List of today's orders for this caller
 */
export async function getTodayOrdersByPhone(phone) {
  try {
    console.log(phone)
    const startOfDay = moment().utc().startOf("day").toISOString();
    const endOfDay = moment().utc().endOf("day").toISOString();
    console.log(startOfDay, endOfDay)
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("phone", phone)
      .gte("updated_at", startOfDay)
      .lte("updated_at", endOfDay)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error(`[Supabase] Error fetching today's orders for ${phone}: ${error.message}`);
      throw error;
    }

    return data;
  } catch (error) {
    console.error(`[Supabase] Unexpected error in getTodayOrdersByPhone: ${error.message}`);
    throw error;
  }
}
