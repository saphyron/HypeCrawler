const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Function to split large JSON array into smaller chunks
async function splitLargeJSONArray(filePath, maxObjectsPerFile) {
    const outputDir = path.dirname(filePath);
    const fileName = path.basename(filePath, '.json');
    
    let fileIndex = 0;
    let currentObjects = [];
    let buffer = '';
    let totalObjects = 0;
    let insideArray = false;

    const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: 'utf8' }),
        crlfDelay: Infinity
    });

    rl.on('line', (line) => {
        line = line.trim();

        if (line === '[' || line === ']') {
            // Skip the opening and closing brackets of the JSON array
            insideArray = true;
            return;
        }

        buffer += line;

        if (line.endsWith('},') || line.endsWith('}]') || line.endsWith('}')) {
            try {
                // Remove any trailing comma or fix potential array issues
                buffer = buffer.replace(/},$/, '}').replace(/\],$/, ']').trim();

                // Parse the JSON object
                const jsonObject = JSON.parse(buffer);

                currentObjects.push(jsonObject);
                totalObjects++;
                buffer = ''; // Reset the buffer after successfully parsing

                // Write to file when maxObjectsPerFile is reached
                if (currentObjects.length >= maxObjectsPerFile) {
                    const newFileName = `${fileName}_part${fileIndex}.json`;
                    const outputPath = path.join(outputDir, newFileName);

                    fs.writeFileSync(outputPath, JSON.stringify(currentObjects, null, 2));
                    console.log(`Created ${newFileName} with ${currentObjects.length} objects`);

                    fileIndex++;
                    currentObjects = [];
                }

            } catch (error) {
                console.error(`Error parsing line: ${line}, error: ${error.message}`);
                buffer = '';  // Reset buffer on parse failure to avoid cascading issues
            }
        }
    });

    rl.on('close', () => {
        // Write remaining objects to a final file
        if (currentObjects.length > 0) {
            const newFileName = `${fileName}_part${fileIndex}.json`;
            const outputPath = path.join(outputDir, newFileName);

            fs.writeFileSync(outputPath, JSON.stringify(currentObjects, null, 2));
            console.log(`Created ${newFileName} with ${currentObjects.length} objects`);
        }
        console.log(`Finished processing the file. Total objects processed: ${totalObjects}`);
    });
}

// Specify the large JSON file path
const filePath = 'E:/Data/JSON Files/OldDatabase_TableID-annonceFile28.json';  // Adjust this to your file path
const maxObjectsPerFile = 10000;  // Adjust this value as needed (e.g., 10000 objects per file)

splitLargeJSONArray(filePath, maxObjectsPerFile);
