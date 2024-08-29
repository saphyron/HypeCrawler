const fs = require('fs');
const path = require('path');
const orm = require('./general-orm-1.0.0'); // Adjust the path as necessary
//const orm = require('./general-orm-1.0.1-pool'); // Adjust the path as necessary
const { parse } = require('json2csv'); // Ensure this import is correct


// TODO: Document the file. Add comments to the code.

async function exportToCSV() {
    console.log('Starting exportToCSV function');
    let connection;
    try {
        connection = await orm.connectDatabase();
        console.log('Database connection established');

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

        const query = `
            SELECT a.id, a.body as searchable_body, r.region_id, r.name as region_name, a.timestamp, a.title, a.cvr
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE DATE(a.timestamp) = '${formattedDate}'
            GROUP BY a.id;
        `;

        const query2 = `
            SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE DATE(a.timestamp) = '${formattedDate}'
            GROUP BY a.id;
        `;

        const query3 = `
        SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE r.name = 'cyber'
            GROUP BY a.id;
        `;

        const query4 = `
        SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            GROUP BY a.id;
        `;

        console.log('Executing query:', query2);
        connection.query(query2, (err, results, fields) => {
            if (err) {
                console.error('Error executing query:', err);
                connection.end();
                return;
            }

            console.log('Query executed successfully');
            //console.log('Results:', results);

            if (results.length === 0) {
                console.log('No data returned from the query.');
                connection.end();
                return;
            }

            // Convert the results to JSON and handle special cases
            const jsonData = results.map(row => {
                let jsonObject = {};
                fields.forEach((field) => {
                    let value = row[field.name];

                    // If the field is a Buffer, convert it to a string
                    if (Buffer.isBuffer(value)) {
                        value = value.toString('utf8');
                    }

                    // Convert null or empty values to "n/a"
                    if (value === null || value === '') {
                        value = 'n/a';
                    }

                    // Ensure proper handling of text fields, such as replacing newlines
                    if (typeof value === 'string') {
                        value = value.replace(/\r?\n|\r/g, ' ').trim(); // Replace newlines with space and trim
                    }

                    jsonObject[field.name] = value;
                });
                return jsonObject;
            });

            //console.log('JSON Data:', jsonData);
            const resultCount = jsonData.length;
            console.log('Result count:', resultCount);

            const datePart = today.toISOString().split('T')[0]; // YYYY-MM-DD
            const fileName = `${datePart}_All Fields_${resultCount}_data.csv`;

            // Use the absolute path directly
            const outputDir = 'C:\\Users\\jgra\\OneDrive - EFIF\\Skrivebord\\CSV Files';
            const outputPath = path.resolve(outputDir, fileName);  // Resolve to ensure correct path handling

            console.log('Writing CSV file:', outputPath);

            const csvContent = parse(jsonData);
            fs.writeFileSync(outputPath, csvContent, 'utf8');
            console.log('CSV file written successfully');

        });
    } catch (error) {
        console.log("Error at main → connectDatabase(): " + error);
        throw error;
    } finally {
        if (connection) await orm.disconnectDatabase();
    }
}

module.exports = { exportToCSV };
