/**
 * @file fileSizeFixer.js
 * @description Splits a large JSON array file into smaller chunks to manage memory usage during data uploads.
 * This utility script reads a large JSON array from a file and splits it into multiple smaller JSON files,
 * each containing a specified maximum number of objects.
 * It is useful when dealing with large datasets that need to be processed in smaller batches.
 */

const fs = require('fs'); // File system module for reading and writing files
const readline = require('readline'); // Module for reading data from a readable stream one line at a time
const path = require('path'); // Module for handling file paths

/**
 * Splits a large JSON array file into smaller JSON files, each containing a maximum number of objects.
 *
 * @async
 * @function splitLargeJSONArray
 * @param {string} filePath - The path to the large JSON array file to be split.
 * @param {number} maxObjectsPerFile - The maximum number of JSON objects per output file.
 * @returns {Promise<void>}
 */
async function splitLargeJSONArray(filePath, maxObjectsPerFile) {
    const outputDir = path.dirname(filePath); // Directory where the output files will be saved
    const fileName = path.basename(filePath, '.json'); // Base name of the input file without extension
    
    let fileIndex = 0; // Index for naming output files
    let currentObjects = []; // Array to hold objects for the current output file
    let buffer = ''; // Buffer to accumulate lines until a complete JSON object is formed
    let totalObjects = 0; // Counter for total objects processed
    let insideArray = false; // Flag to indicate if the reader is inside the JSON array

    // Create a readline interface to read the input file line by line
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    // Event listener for each line read from the file
    rl.on('line', (line) => {
        line = line.trim(); // Remove leading and trailing whitespace

        // Skip the opening and closing brackets of the JSON array
        if (line === '[' || line === ']') {
            insideArray = true;
            return;
        }

        buffer += line; // Accumulate lines into the buffer

        // Check if the line marks the end of a JSON object
        if (line.endsWith('},') || line.endsWith('}]') || line.endsWith('}')) {
            try {
                // Clean up the buffer by removing trailing commas and whitespaces
                buffer = buffer.replace(/},$/, '}').replace(/\],$/, ']').trim();

                // Parse the buffered string into a JSON object
                const jsonObject = JSON.parse(buffer);

                // Add the parsed object to the current batch
                currentObjects.push(jsonObject);
                totalObjects++; // Increment the total objects counter
                buffer = ''; // Reset the buffer after successfully parsing

                // Check if the current batch has reached the maximum size
                if (currentObjects.length >= maxObjectsPerFile) {
                    // Construct the output file name and path
                    const newFileName = `${fileName}_part${fileIndex}.json`;
                    const outputPath = path.join(outputDir, newFileName);

                    // Write the current batch to the output file
                    fs.writeFileSync(outputPath, JSON.stringify(currentObjects, null, 2));
                    console.log(`Created ${newFileName} with ${currentObjects.length} objects`);

                    fileIndex++; // Increment the file index for the next output file
                    currentObjects = []; // Reset the current objects array
                }

            } catch (error) {
                console.error(`Error parsing line: ${line}, error: ${error.message}`);
                buffer = '';  // Reset buffer on parse failure to avoid cascading issues
            }
        }
    });

    // Event listener for when the file reading is complete
    rl.on('close', () => {
        // Check if there are any remaining objects to write to a file
        if (currentObjects.length > 0) {
            const newFileName = `${fileName}_part${fileIndex}.json`;
            const outputPath = path.join(outputDir, newFileName);

            // Write the remaining objects to the final output file
            fs.writeFileSync(outputPath, JSON.stringify(currentObjects, null, 2));
            console.log(`Created ${newFileName} with ${currentObjects.length} objects`);
        }
        console.log(`Finished processing the file. Total objects processed: ${totalObjects}`);
    });
}

// Define the input file path and maximum objects per output file
const filePath = 'path to file';  // Adjust this to your file path
const maxObjectsPerFile = 10000;  // Adjust this value as needed (e.g., 10000 objects per file)

// Start the splitting process
splitLargeJSONArray(filePath, maxObjectsPerFile);
