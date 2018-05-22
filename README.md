# HypeCrawler #

## Synopsis

Service to scrape and insert advertisements into a database. The program can be used as a Linux-service or executed from the main.js file.  

## Motivation

The program was developed as a AP-graduation project to help Associate professor Morten Mathiasen collect data for his research project at Business Academy Aarhus.  

## Installation

Prerequisite:
* Have access to a MySQL-database on the Linux-service or to cloud. 
* Have SSH-client "PuTTY" for Windows or SHH access on Linux and Mac machines.
* Have Node.js installed for execution on own machine or Linux-server.

For Linux-service:
* Pull project to Linux-machine.
* For first time execution, run npm install on project root to install dependencies.
* Use following string to execute service with environment-variables: 
  MYSQL_HOST=hostname MYSQL_USER=user MYSQL_PASSWORD=password MYSQL_                                                                                                                                                           DATABASE=databaseName SCRAPER=mode nohup node main.js &

    + MYSQL_HOST        - Name of the host with MySQL-service
    + MYSQL_USER        - Username to MySQL-database.
    + MYSQL_PASSWORD    - Password to MySQL-database.
    + MYSQL_DATABASE    - Name of database. 
    + SCRAPER           - Mode in which the program will run. (all, jobindex, careerjet)                                                                  

## API Reference

* Program executed on Node, https://nodejs.org/en/
* Data is stored in a MySQL database, https://www.mongodb.com/
* Access to database enabled by MySQL npm-package, https://www.npmjs.com/package/mysql
* Google's "Puppeteer" for Crawling and extraction of data from web, https://www.npmjs.com/package/puppeteer

## Contributors

Contribution is welcome. You are free to use the existing code and/or improve it. Fork the repository and make pull request to release your changes to the repository.

## Authors

* **Morten Mathiasen** - *Supervisor & Project Leader* - [mortenmathiasen](https://github.com/mortenmathiasen)
* **Patrick Wegener Meyer** - *Computer Science AP-graduate Student* - [Eqliphex](https://github.com/Eqliphex)

## Contact

For more info contact:
* Morten Mathiasen, Associate professor @ Business Academy Aarhus
* Patrick Wegener Meyer, AP-Graduate @ tbt_paddik@hotmail.com

## License

See the [LICENSE](LICENSE.md) file for license rights and limitations (MIT).
