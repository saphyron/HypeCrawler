const fs = require('fs').promises; // Use non-blocking file operations
const path = require('path');
const orm = require('./general-orm-1.0.0');
const { parse } = require('json2csv');

async function exportToCSV(queryNumber) {
    console.log('Starting exportToCSV function');
    let connection;

    try {
        // Establish a database connection
        connection = await orm.connectDatabase();
        console.log('Database connection established');

        const today = new Date().toISOString().split('T')[0]; // Format date once
        const query = sqlQueries(queryNumber, today);

        // Execute query and process results with async/await
        const [results, fields] = await executeQuery(connection, query);

        if (!results.length) {
            console.log('No data returned from the query.');
            return;
        }

        const jsonData = results.map(row =>
            fields.reduce((jsonObject, field) => {
                let value = row[field.name];

                // Process buffer and string values
                value = Buffer.isBuffer(value) ? value.toString('utf8') : value;
                value = value === null || value === '' ? 'n/a' : value;
                value = typeof value === 'string' ? value.replace(/\r?\n|\r/g, ' ').trim() : value;

                jsonObject[field.name] = value;
                return jsonObject;
            }, {})
        );

        const resultCount = jsonData.length;
        console.log('Result count:', resultCount);

        // Generate filename using date and result count
        const fileName = `${today}_All Fields_${resultCount}_data.csv`;
        const outputPath = path.resolve('C:\\Users\\jgra\\OneDrive - EFIF\\Skrivebord\\CSV Files', fileName);

        console.log('Writing CSV file:', outputPath);

        // Write CSV asynchronously
        const csvContent = parse(jsonData);
        await fs.writeFile(outputPath, csvContent, 'utf8');
        console.log('CSV file written successfully');
    } catch (error) {
        console.error('Error during exportToCSV:', error);
        throw error;
    } finally {
        if (connection) await orm.disconnectDatabase();
    }
}

function sqlQueries(queryNumber, formattedDate) {
    const queries = {
        1: `
            SELECT a.id, a.body as searchable_body, r.region_id, r.name as region_name, a.timestamp, a.title, a.cvr
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE DATE(a.timestamp) = '${formattedDate}';
        `,
        2: `
            SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE DATE(a.timestamp) = '${formattedDate}';
        `,
        3: `
            SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE r.name = 'cyber';
        `,
        4: `
            SELECT *
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id;
        `,
    };

    if (!queries[queryNumber]) throw new Error('Invalid query number');
    return queries[queryNumber];
}

function executeQuery(connection, query) {
    return new Promise((resolve, reject) => {
        connection.query(query, (err, results, fields) => {
            if (err) return reject(err);
            resolve([results, fields]);
        });
    });
}

module.exports = { exportToCSV };
