const fs = require("fs");
const mysql = require("mysql2");
const path = require("path");
const cliProgress = require("cli-progress");
const dayjs = require("dayjs");

// Database connection configuration
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "4b6YA5Uq2zmB%t5u2*e5jT!u4c$lfw6T",
  database: "Merged_Database_Test",
});

// File path for the JSON file
const jsonFilePath = path.join('C:\\Users\\jgra\\OneDrive - EFIF\\Skrivebord\\CSV Files', 'combined_output.json');

// Initialize the progress bar
const progressBar = new cliProgress.SingleBar({
  format: 'Progress | {bar} | {percentage}% || {value}/{total} lines processed || {status}',
}, cliProgress.Presets.shades_classic);

// Function to check if an ID already exists in the database
const checkIfExists = (ID) => {
  return new Promise((resolve, reject) => {
    const query = 'SELECT 1 FROM annonce WHERE ID = ? LIMIT 1';
    connection.query(query, [ID], (err, results) => {
      if (err) {
        return reject(err);
      }
      resolve(results.length > 0);
    });
  });
};

// Function to insert data into the database
const insertData = (data) => {
  const {
    ID,
    TITLE,
    BODY,
    REGION_ID,
    TIMESTAMP,
    CHECKSUM,
    URL,
    CVR,
    Homepage,
    possible_duplicate,
    body_hash,
    companyUrlFromAnnonce,
  } = data;

  // Convert TIMESTAMP to MariaDB-compatible format (YYYY-MM-DD HH:MM:SS)
  const formattedTimestamp = TIMESTAMP ? dayjs(TIMESTAMP).format('YYYY-MM-DD HH:mm:ss') : null;

  // Convert CVR to null if it is not a valid integer
  const formattedCVR = /^\d+$/.test(CVR) ? parseInt(CVR, 10) : null;

  // Convert possible_duplicate to null if it is not a valid integer
  const formattedPossibleDuplicate = /^\d+$/.test(possible_duplicate) ? parseInt(possible_duplicate, 10) : null;

  const query = `
    INSERT INTO annonce (
      ID, TITLE, BODY, REGION_ID, TIMESTAMP, CHECKSUM, URL, CVR,
      Homepage, possible_duplicate, body_hash, companyurlfromannonce
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  return new Promise((resolve, reject) => {
    connection.query(query, [
      ID,
      TITLE,
      BODY,
      REGION_ID,
      formattedTimestamp,  // Use the formatted timestamp
      CHECKSUM,
      URL,
      formattedCVR,  // Use the formatted CVR
      Homepage,
      formattedPossibleDuplicate,  // Use the formatted possible_duplicate
      body_hash,
      companyUrlFromAnnonce,
    ], (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
};

// Function to count the total number of lines in the file
const countTotalLines = (filePath) => {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    const readStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    readStream.on('data', (chunk) => {
      lineCount += chunk.split('\n').length - 1;
    });
    readStream.on('end', () => resolve(lineCount));
    readStream.on('error', reject);
  });
};

// Function to process the JSON file line by line
const processJsonFile = async () => {
  try {
    const totalLines = await countTotalLines(jsonFilePath);
    let processedLines = 0;
    let statusMessage = 'Starting...';

    // Start the progress bar
    progressBar.start(totalLines, 0, { status: statusMessage });

    const readStream = fs.createReadStream(jsonFilePath, { encoding: 'utf8' });
    let buffer = '';
    const promises = [];

    readStream.on('data', (chunk) => {
      buffer += chunk;
      let boundary = buffer.indexOf('\n');

      while (boundary !== -1) {
        const line = buffer.substring(0, boundary);
        buffer = buffer.substring(boundary + 1);
        boundary = buffer.indexOf('\n');

        processedLines++;
        try {
          const data = JSON.parse(line);

          // Handle async operations sequentially to avoid overwhelming the database
          const promise = checkIfExists(data.ID)
            .then((exists) => {
              if (!exists) {
                // If the ID does not exist, insert the data
                return insertData(data).then(() => {
                  statusMessage = `Inserted ID ${data.ID}`;
                  updateProgress();
                });
              } else {
                statusMessage = `ID ${data.ID} already exists. Skipping...`;
                updateProgress();
              }
            })
            .catch((err) => {
              statusMessage = `Error checking or inserting ID ${data.ID}: ${err.message}`;
              updateProgress();
            });

          promises.push(promise);
        } catch (err) {
          statusMessage = `Error parsing JSON line: ${err.message}`;
          updateProgress();
        }
      }
    });

    readStream.on('end', async () => {
      // Wait for all async operations to complete
      await Promise.all(promises);
      progressBar.stop();
      console.log('Finished processing the JSON file.');
      connection.end();
    });

    readStream.on('error', (err) => {
      statusMessage = `Error reading the JSON file: ${err.message}`;
      updateProgress();
    });

    // Update progress bar with the current status
    const updateProgress = () => {
      progressBar.update(processedLines, { status: statusMessage });
    };
  } catch (err) {
    console.error('Error processing the JSON file:', err);
    connection.end();
  }
};

// Start processing the JSON file
processJsonFile();
