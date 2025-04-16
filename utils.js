import fs from 'fs'
import moment from "moment-timezone";

/**
 * Safely deletes a file if it exists
 * @param {string} filePath - Path to the file to delete
 */
export const deleteFileSafe = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      // console.log(`[Utils] Deleted file: ${filePath}`);
    } else {
      // console.warn(`[Utils] File not found: ${filePath}`);
    }
  } catch (error) {
    // console.error(`[Utils] Error deleting file ${filePath}: ${error.message}`);
  }
};

export const formatPendingOrder = (order) => {
  return `${order.name}(${order.phone}) ordered ${order.foods} at ${moment(order.updated_at).utc().format("hh:mm A")} to be ready for pick up at ${order.time}, location: ${order.location}, total: ${order.price}`;
}
