import fs from 'fs'

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