[![Semver](https://img.shields.io/badge/SemVer-1.0.0-brightgreen.svg)](http://semver.org/spec/v1.0.0.html)
![JSDoc](https://img.shields.io/badge/jsdoc-3.5.5-blue.svg)
# HypeCrawler #

## Synopsis

Service to scrape and insert advertisements into a database. The program can be used as a Linux-service or executed from the main.js file.  

## Motivation

The program was developed as a AP-graduation project to help Associate professor Morten Mathiasen collect data for his research project at Business Academy Aarhus.  

## Installation

**Prerequisites:**
* Access to a MySQL-database on the Linux-service or to cloud. 
* SSH-client "PuTTY" for Windows or SHH Terminal access on Linux and Mac machines.
* Node.js installed for execution on own machine or Linux-server.

**For Linux-service:**
1. Pull project to Linux-machine.
2. For first time execution, run npm install on project root to install dependencies.
3. Use following string to execute service with environment-variables: 
  MYSQL_HOST=hostname MYSQL_USER=user MYSQL_PASSWORD=password MYSQL_DATABASE=databaseName SCRAPER=mode nohup node main.js &

    + MYSQL_HOST        - Name of the host with MySQL-service
    + MYSQL_USER        - Username to MySQL-database.
    + MYSQL_PASSWORD    - Password to MySQL-database.
    + MYSQL_DATABASE    - Name of database. 
    + SCRAPER           - Mode in which the program will run. (all, jobindex, careerjet)                                                                  

**For local-execution (Webstorm):**
1. Pull project to computer.
2. Run npm install.
3. Set up Configurations. "Edit Configurations" -> Node.js -> "Environment variables" 

## API Reference

* Program executed in Node.js, https://nodejs.org/en/
* Data is stored in a MySQL database, https://www.mysql.com/
* Access to database enabled by MySQL npm-package, https://www.npmjs.com/package/mysql
* Google's "Puppeteer" for Crawling and extraction of data from web, https://www.npmjs.com/package/puppeteer

## Contributors

Contribution is welcome. You are free to use the existing code and/or improve it. Fork the repository and make pull request to release your changes to the repository.

## Authors

* **Morten Mathiasen** - *Supervisor & Project Leader* - [mortenmathiasen](https://github.com/mortenmathiasen)
* **Patrick Wegener Meyer** - *Computer Science AP-graduate Student* - [Eqliphex](https://github.com/Eqliphex)

## Documentation
*Documentation generated with JSDoc and formatted with Docdash*
* Documentation found on: (https://research-and-innovation-eaaa.github.io/HypeCrawler/)
* Refresh documentation by running following command in terminal: *npm run docs*
    * **Alternatively:** Automate the process by adding previous command to "pre-commit" file under Hypecrawler/.git/hooks.
* Configuring the docs-generation script is done in ./conf.json

## Contact

For more info contact:
* Morten Mathiasen, Associate professor @ Business Academy Aarhus
* Patrick Wegener Meyer, Business Academy Aarhus CS AP-Alumnus @ tbt_paddik@hotmail.com

## License

See the [LICENSE](LICENSE.md) file for license rights and limitations (MIT).
