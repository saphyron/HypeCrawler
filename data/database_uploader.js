const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const orm = require('./general-orm-1.0.0');

// Function to sanitize strings
function sanitizeString(input) {
    return input ? input.replace(/[\uFFFD]/g, '').trim() : null;
}

// Function to remove zero-width characters and other problematic characters
function removeZeroWidth(input) {
    return input ? input.replace(/[\u200B-\u200D\uFEFF]/g, '').trim() : null;
}

async function uploadJSONToDatabase(jsonData) {
    let successTotalCounter = 0;
    let existingTotalCounter = 0;
    let errorTotalCounter = 0;

    try {
        // Establish a database connection
        const connection = await orm.connectDatabase();

        for (let row of jsonData) {
            try {
                const checksum = row.checksum || null; // Use lowercase `checksum` to match the CSV header

                // Check if the checksum already exists in the database
                const exists = await orm.FindChecksum(checksum);

                if (exists) {
                    existingTotalCounter++;
                    console.log(`Record with checksum ${checksum} already exists. Skipping insertion.`);
                    continue;
                }

                // Get or Insert the region_id
                const regionName = row.NAME || null;
                const regionId = await getRegionId(regionName);

                if (!regionId) {
                    errorTotalCounter++;
                    console.error(`Region not found and could not be inserted for region name: ${regionName}`);
                    continue;
                }

                // Convert the timestamp to MySQL compatible format
                let timestamp = row.TIMESTAMP ? new Date(row.TIMESTAMP).toISOString().slice(0, 19).replace('T', ' ') : null;

                // Map JSON data to database columns with sanitization, ignoring the `ID` column
                const newRecord = {
                    title: removeZeroWidth(sanitizeString(row.TITLE)),
                    body: removeZeroWidth(sanitizeString(row.BODY)),
                    regionId: regionId,
                    timestamp: timestamp,
                    checksum: checksum,
                    url: removeZeroWidth(sanitizeString(row.URL)),
                    cvr: removeZeroWidth(sanitizeString(row.CVR)),
                    homepage: removeZeroWidth(sanitizeString(row.HOMEPAGE)),
                };

                // Insert the new record into the database
                await insertAnnonceManually(connection, newRecord);
                successTotalCounter++;
            } catch (error) {
                errorTotalCounter++;
                console.error(`Error inserting record: ${error}`);
            }
        }

        console.log('----------------------------------------------------------');
        console.log(`CSV TO DATABASE IMPORT STATISTICS`);
        console.log('----------------------------------------------------------');
        const totalEntries = successTotalCounter + existingTotalCounter + errorTotalCounter;
        console.log(`${successTotalCounter} OUT OF ${totalEntries} (${Math.round((successTotalCounter / totalEntries) * 100)}%) --- INSERTS`);
        console.log('----------------------------------------------------------');
        console.log(`${existingTotalCounter} OUT OF ${totalEntries} (${Math.round((existingTotalCounter / totalEntries) * 100)}%) --- EXISTS`);
        console.log('----------------------------------------------------------');
        console.log(`${errorTotalCounter} OUT OF ${totalEntries} (${Math.round((errorTotalCounter / totalEntries) * 100)}%) --- ERRORS`);
        console.log('----------------------------------------------------------');

    } catch (error) {
        console.error(`Database connection error: ${error}`);
    } finally {
        await orm.disconnectDatabase();
    }
}

// Function to retrieve region_id based on region_name, or insert the region if it doesn't exist
async function getRegionId(regionName) {
    if (!regionName) return null;
    try {
        const result = await orm.FindRegionID(regionName);
        if (result && result.length > 0) {
            return result[0].region_id;
        }
        // Insert the region if it doesn't exist
        const newRegion = { name: regionName };
        await orm.InsertRegion(newRegion);
        const newResult = await orm.FindRegionID(regionName);
        return newResult[0].region_id;
    } catch (error) {
        console.error(`Error getting or inserting region ID: ${error}`);
        return null;
    }
}

// Function to manually insert annonce record
async function insertAnnonceManually(connection, record) {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO annonce (TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL, CVR, Homepage) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        connection.query(query, [record.title, record.body, record.regionId, record.timestamp, record.checksum, record.url, record.cvr, record.homepage],
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                resolve(result);
            });
    });
}

// Function to convert CSV to JSON
function convertCSVToJSON(csvFilePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// Main function to convert CSV to JSON and upload to the database
async function main() {
    const csvFilePath = 'C:\\Users\\jgra\\OneDrive - EFIF\\Skrivebord\\CSV Files\\Full Database from 19 august to 26 august.csv';

    try {
        const jsonData = await convertCSVToJSON(csvFilePath);
        await uploadJSONToDatabase(jsonData);
    } catch (error) {
        console.error(`Error in main function: ${error}`);
    }
}

module.exports = { convertCSVToJSON, uploadJSONToDatabase, main };

// Execute the main function if this script is run directly
if (require.main === module) {
    main();
}
