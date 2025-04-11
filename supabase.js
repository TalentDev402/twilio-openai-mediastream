import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

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
