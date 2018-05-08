const MAX_REQUESTS = 3;
const REQUEST_QUEUE = [];

class Pagepool {

    constructor(browser) {
        this.browser = browser;
        this.PAGE_POOL = [];
    }

    reservePage(url) {
        return new Promise((resolve, reject) => {
            if (this.PAGE_POOL.length < MAX_REQUESTS) {
                this.browser.newPage().then((result) => {
                    this.PAGE_POOL[this.PAGE_POOL.length] = {page: result, url: url};
                    resolve(result);
                })
            }
            else {
                for (let page of this.PAGE_POOL) {
                    if (page.url === undefined) {
                        page.url = url;
                        resolve(page.page);
                        return;
                    }
                }
                REQUEST_QUEUE.push({url, resolve, reject})
            }
        })
    }

    releasePage(url) {
        for (let page of this.PAGE_POOL) {
            if (page.url === url) {
                page.url = undefined;
                if (REQUEST_QUEUE.length > 0) {
                    let object = REQUEST_QUEUE.pop();
                    page.url = object.url;
                    page.resolve(page.page);
                }
            }
        }
    }
}

module.exports = Pagepool;