const fs = require('fs');
const mysql = require('mysql');
const path = require('path');
const cliProgress = require('cli-progress');

// Create a pool of connections
const pool = mysql.createPool({
    connectionLimit: 10, // Adjust as needed
    host: 'localhost',
    user: 'root',
    password: '4b6YA5Uq2zmB%t5u2*e5jT!u4c$lfw6T',
    database: 'Merged_Database_Test'
});

// Function to get a connection from the pool
async function getConnection() {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) return reject(err);
            resolve(connection);
        });
    });
}

// Cache to store existing checksums
let checksumCache = new Set();

// Function to populate the checksum cache
async function populateChecksumCache() {
    try {
        const connection = await getConnection();
        const query = 'SELECT checksum FROM annonce'; // Adjust table/column name as needed

        const results = await new Promise((resolve, reject) => {
            connection.query(query, (error, results) => {
                if (error) return reject(error);
                resolve(results);
            });
        });

        results.forEach(row => checksumCache.add(row.checksum));
        console.log(`Checksum cache populated with ${checksumCache.size} records.`);
        connection.release();
    } catch (error) {
        console.error(`Error populating checksum cache: ${error}`);
    }
}

// Function to sanitize strings by removing problematic characters and trimming
function sanitizeString(input) {
    try {
        return input ? input.replace(/[\uFFFD\u200B-\u200D\uFEFF]/g, '').trim() : null;
    } catch (e) {
        console.error(`Error sanitizing string: ${e.message}. Returning the original input.`);
        return input ? input.trim() : null;
    }
}

// Function to remove zero-width characters and other problematic characters
function removeZeroWidth(input) {
    return input ? input.replace(/[\u200B-\u200D\uFEFF]/g, '').trim() : null;
}

// Progress bars initialization
const fileProgressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
const rowProgressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

let startTime;
let totalRowsProcessed = 0;
let totalFilesProcessed = 0;
const BATCH_SIZE = 500;
let rowBuffer = [];

// Function to upload JSON data to the database in batches with transactions
async function uploadJSONToDatabase(jsonData, fileIndex, totalFiles, filePath) {
    let successTotalCounter = 0;
    let existingTotalCounter = 0;
    let errorTotalCounter = 0;
    const totalRows = jsonData.length;

    // Initialize the row progress bar
    rowProgressBar.start(totalRows, 0);

    try {
        const connection = await getConnection();
        await connection.beginTransaction(); // Start a transaction

        for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
            const row = jsonData[rowIndex];
            try {
                const checksum = row.checksum || null;

                // Check if the checksum exists in the cache
                if (checksumCache.has(checksum)) {
                    existingTotalCounter++;
                    rowProgressBar.update(rowIndex + 1);
                    continue; // Skip insertion for existing records
                }

                // Directly use the region_id from the JSON file
                const regionId = row.region_id ? parseInt(row.region_id, 10) : null;

                if (!regionId) {
                    errorTotalCounter++;
                    console.error(`Region ID is missing or invalid for record with checksum: ${checksum}`);
                    rowProgressBar.update(rowIndex + 1);
                    continue;
                }

                // Convert the timestamp to MySQL compatible format
                let timestamp = row.timestamp ? new Date(row.timestamp).toISOString().slice(0, 19).replace('T', ' ') : null;

                const newRecord = {
                    title: removeZeroWidth(sanitizeString(row.title)),
                    body: removeZeroWidth(sanitizeString(row.body)),
                    regionId: regionId,
                    timestamp: timestamp,
                    checksum: checksum,
                    url: removeZeroWidth(sanitizeString(row.url)),
                    cvr: removeZeroWidth(sanitizeString(row.CVR)),
                    homepage: removeZeroWidth(sanitizeString(row.homepage)),
                };

                // Add the new record to the buffer
                rowBuffer.push(newRecord);

                if (rowBuffer.length >= BATCH_SIZE) {
                    await insertBatch(connection, rowBuffer);
                    rowBuffer = [];
                }

                successTotalCounter++;
            } catch (error) {
                errorTotalCounter++;
                console.error(`Error inserting record: ${error}`);
            }

            rowProgressBar.update(rowIndex + 1);
            totalRowsProcessed++;
        }

        // Insert any remaining rows in the buffer
        if (rowBuffer.length > 0) {
            await insertBatch(connection, rowBuffer);
            rowBuffer = [];
        }

        // Commit the transaction after batch inserts
        await connection.commit();
        console.log(`Finished processing file: ${filePath}`);
        rowProgressBar.stop();

        const elapsedTime = (new Date() - startTime) / 1000;
        const estimatedTimeRemaining = (elapsedTime / totalFilesProcessed) * (totalFiles - totalFilesProcessed);
        console.log(`Elapsed Time: ${elapsedTime.toFixed(2)}s`);
        console.log(`Estimated Time Remaining: ${(estimatedTimeRemaining / 60).toFixed(2)} minutes`);

        connection.release(); // Release the connection back to the pool

    } catch (error) {
        console.error(`Database connection error: ${error}`);
        // If an error occurs, rollback the transaction
        if (connection) await connection.rollback();
    }
}

// Function to insert a batch of records into the database
async function insertBatch(connection, records) {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO annonce (TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL, CVR, Homepage) VALUES ?`;
        const values = records.map(record => [
            record.title, record.body, record.regionId, record.timestamp, record.checksum, record.url, record.cvr, record.homepage
        ]);

        connection.query(query, [values], (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
    });
}

// Function to read and parse JSON files
function loadJSONFile(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);
            try {
                const jsonData = JSON.parse(data);
                resolve(jsonData);
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

async function processJSONFilesInFolder(folderPath) {
    try {
        const files = fs.readdirSync(folderPath);
        const jsonFiles = files.filter(file => path.extname(file) === '.json');
        const totalFiles = jsonFiles.length;

        console.log(`Total files to process: ${totalFiles}`);

        fileProgressBar.start(totalFiles, 0);
        startTime = new Date();

        for (let fileIndex = 0; fileIndex < jsonFiles.length; fileIndex++) {
            const file = jsonFiles[fileIndex];
            const filePath = path.join(folderPath, file);
            console.log(`Processing file: ${filePath}`);

            const jsonData = await loadJSONFile(filePath);
            await uploadJSONToDatabase(jsonData, fileIndex + 1, totalFiles, filePath);

            totalFilesProcessed++;
            fileProgressBar.update(totalFilesProcessed);
        }

        fileProgressBar.stop();
        console.log('All files processed successfully.');

    } catch (error) {
        console.error(`Error processing folder: ${error}`);
    }
}

// Main function to read all JSON files in the folder and process them
async function main() {
    const folderPath = 'E:\\Data\\JSON Files';

    await populateChecksumCache(); // Populate the checksum cache before processing files
    await processJSONFilesInFolder(folderPath);
}

module.exports = { loadJSONFile, uploadJSONToDatabase, main };

// Execute the main function if this script is run directly
if (require.main === module) {
    main();
}
