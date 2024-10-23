const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');
const cliProgress = require('cli-progress');

// Folder path containing the CSV files
const folderPath = 'C:\\Users\\jgra\\OneDrive - EFIF\\Skrivebord\\CSV Files';
const outputFilePath = path.join(folderPath, 'combined_output.json');

// Function to check if a given item already exists in the JSON file
const isDuplicateInFile = (newItem, existingItemsSet) => {
  return existingItemsSet.has(newItem.ID);
};

// Initialize the progress bar
const progressBar = new cliProgress.SingleBar({
  format: 'Progress | {bar} | {percentage}% || {value}/{total} CSV files processed',
}, cliProgress.Presets.shades_classic);

// Read all CSV files in the specified folder
fs.readdir(folderPath, (err, files) => {
  if (err) {
    console.error('Error reading the directory:', err);
    return;
  }

  const csvFiles = files.filter((file) => path.extname(file).toLowerCase() === '.csv');
  if (csvFiles.length === 0) {
    console.log('No CSV files found in the folder.');
    return;
  }

  // Start the progress bar with the total number of CSV files
  progressBar.start(csvFiles.length, 0);

  let filesProcessed = 0;

  // Load existing IDs from the output file into a Set for fast lookup
  const existingItemsSet = new Set();
  if (fs.existsSync(outputFilePath)) {
    const existingData = fs.readFileSync(outputFilePath, 'utf8').split('\n').filter(line => line.trim());
    existingData.forEach(line => {
      try {
        const item = JSON.parse(line);
        if (item.ID) {
          existingItemsSet.add(item.ID);
        }
      } catch (e) {
        console.warn('Warning: Skipping invalid JSON line:', line);
      }
    });
  }

  // Function to process one CSV file at a time
  const processFile = (index) => {
    if (index >= csvFiles.length) {
      progressBar.stop();
      console.log('All CSV files have been processed and combined.');
      return;
    }

    const filePath = path.join(folderPath, csvFiles[index]);

    // Process the current CSV file
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // If the item is not a duplicate, append it to the output file
        if (!isDuplicateInFile(row, existingItemsSet)) {
          existingItemsSet.add(row.ID);
          // Standardize the row to handle missing fields by setting them to null
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
          fs.appendFileSync(outputFilePath, JSON.stringify(standardizedRow) + '\n', 'utf8');
        }
      })
      .on('end', () => {
        // Update the progress bar
        filesProcessed += 1;
        progressBar.update(filesProcessed);

        // Process the next file
        processFile(index + 1);
      })
      .on('error', (err) => {
        console.error('Error processing the file:', filePath, err);
        processFile(index + 1); // Proceed to the next file even if there's an error
      });
  };

  // Start processing the first file
  processFile(0);
});
