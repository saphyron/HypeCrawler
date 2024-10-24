/**
 * @file csvToJsonConverter.js
 * @description Converts multiple CSV files in a specified folder into a combined JSON file.
 * It reads all CSV files in the given directory, processes them to remove duplicates based on the 'ID' field,
 * and writes the standardized data to a single JSON file for easier database upload or other uses.
 */

const fs = require('fs'); // File system module for reading and writing files
const csv = require('csv-parser'); // Module for parsing CSV files
const path = require('path'); // Module for handling file paths
const cliProgress = require('cli-progress'); // Module for displaying a progress bar in the CLI

// Directory containing the CSV files to process
const folderPath = 'C:\\Users\\jgra\\OneDrive - EFIF\\Skrivebord\\CSV Files';

// Path to the output JSON file
const outputFilePath = path.join(folderPath, 'combined_output.json');

/**
 * Checks if a new item is a duplicate by comparing its 'ID' against existing IDs.
 *
 * @param {Object} newItem - The new item to check.
 * @param {Set} existingItemsSet - A set of existing item IDs.
 * @returns {boolean} - Returns true if the item is a duplicate, false otherwise.
 */
const isDuplicateInFile = (newItem, existingItemsSet) => {
  return existingItemsSet.has(newItem.ID);
};

// Initialize a progress bar to display the processing progress
const progressBar = new cliProgress.SingleBar({
  format: 'Progress | {bar} | {percentage}% || {value}/{total} CSV files processed',
}, cliProgress.Presets.shades_classic);

// Read the directory containing the CSV files
fs.readdir(folderPath, (err, files) => {
  if (err) {
    console.error('Error reading the directory:', err);
    return;
  }

  // Filter out only CSV files from the directory
  const csvFiles = files.filter((file) => path.extname(file).toLowerCase() === '.csv');
  if (csvFiles.length === 0) {
    console.log('No CSV files found in the folder.');
    return;
  }

  // Start the progress bar
  progressBar.start(csvFiles.length, 0);

  let filesProcessed = 0; // Counter for the number of files processed

  // Initialize a set to keep track of existing item IDs to avoid duplicates
  const existingItemsSet = new Set();

  // Check if the output file already exists and load existing IDs
  if (fs.existsSync(outputFilePath)) {
    // Read the existing data from the output file
    const existingData = fs.readFileSync(outputFilePath, 'utf8').split('\n').filter(line => line.trim());
    existingData.forEach(line => {
      try {
        const item = JSON.parse(line);
        if (item.ID) {
          existingItemsSet.add(item.ID); // Add existing IDs to the set
        }
      } catch (e) {
        console.warn('Warning: Skipping invalid JSON line:', line);
      }
    });
  }

  /**
   * Processes a CSV file at the given index, reads its contents, and appends standardized data to the output JSON file.
   * Recursively calls itself to process the next file in the list.
   *
   * @param {number} index - The index of the CSV file in the csvFiles array to process.
   */
  const processFile = (index) => {
    // Check if all files have been processed
    if (index >= csvFiles.length) {
      progressBar.stop();
      console.log('All CSV files have been processed and combined.');
      return;
    }

    const filePath = path.join(folderPath, csvFiles[index]); // Get the full path of the current CSV file

    // Create a read stream for the current CSV file
    fs.createReadStream(filePath)
      .pipe(csv()) // Parse the CSV data
      .on('data', (row) => {
        // Check for duplicates and standardize the row
        if (!isDuplicateInFile(row, existingItemsSet)) {
          existingItemsSet.add(row.ID); // Add the new ID to the set

          // Create a standardized row with default values for missing fields
          const standardizedRow = {
            ID: row.ID,
            TITLE: row.TITLE || null,
            BODY: row.BODY || null,
            REGION_ID: row.REGION_ID || null,
            TIMESTAMP: row.TIMESTAMP || null,
            CHECKSUM: row.CHECKSUM || null,
            URL: row.URL || null,
            CVR: row.CVR || null,
            Homepage: row.Homepage || null,
            possible_duplicate: row.possible_duplicate || null,
            body_hash: row.body_hash || null,
            companyUrlFromAnnonce: row.companyUrlFromAnnonce || null,
            region_id: row.region_id || null,
            NAME: row.NAME || null
          };
          // Append the standardized row to the output JSON file
          fs.appendFileSync(outputFilePath, JSON.stringify(standardizedRow) + '\n', 'utf8');
        }
      })
      .on('end', () => {
        // Update the progress bar and process the next file
        filesProcessed += 1;
        progressBar.update(filesProcessed);

        // Recursively process the next file
        processFile(index + 1);
      })
      .on('error', (err) => {
        console.error('Error processing the file:', filePath, err);
        processFile(index + 1); // Proceed to the next file even if there's an error
      });
  };

  // Start processing files from index 0
  processFile(0);
});
