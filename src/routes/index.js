const express = require('express');
const env = require('dotenv');
const router = express.Router();
module.exports = router;

var request = require('request');
var mysql = require('mysql2');
var user = process.env.USER;
var password = process.env.PASSWORD;
var database = process.env.DATABASE;
var apiKey = process.env.APIKEY;
var host = process.env.HOST;
var mysqlPort = process.env.MYSQLPORT;
var products = [];
var productResponse = [];
let start = Date.now();
//console.log(host, user, password, apiKey);
const pool = mysql.createPool({
    connectionLimit: 25, // maximum number of connections in the pool
    host: host,
    user: user,
    port:mysqlPort,
    password: password,
    database: database,
    pool: {
        max: 25,
        min: 0,
        idle: 10000
    }
  });
//const priceupdate = require("priceupdate.js");
router.get('/', (req, res) => {
    res.send('Running fine');
});
router.post('/priceupdate/', async (req, res) => {
    console.log(req.header('apikey'));
    if (req.header('apikey')) {
        console.log(req.header?.apikey);
    }
    if (!req.header('apikey')) {
        res.send('{"message":"no api key"}')
    }
    else if (req.header('apikey') === process.env.AUTHKEY) {
        console.log("/priceupdate called");
        const country = req.body.country || 'fr';
        console.log(country);
        const connection = await getConnection();
        const products = await readProducts(connection);
        
        for (item of products) {
            try {
                console.log(`/priceupdate updating price for ${item}`);
    
                const price = await getPrice(item, country);
                await updatePrice(connection, item, price);
                productResponse.push({ product: item, price: price });
                console.log(`/priceupdate price for ${item} updated`);
            } catch (error) { 
                console.error(error);
                productResponse.push({ product: item, error: error });
                console.error(`Unable to update price for ${item} due to error above`);
            }
        }
    
        connection.release();
        console.log("/priceupdate finished");
        sendProductResponses(res, productResponse);
        //res.send('done');
        //     start = Date.now();
    //   await getProductFromDataBase(res);
        
    }
    else {
        res.send('{"message":"Wrong api key"}');
    }
  
});

const getConnection = async () => new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.log(err)
            return reject(err)
        }
        resolve(connection)
    })
})

const readProducts = async (connection) => new Promise((resolve, reject) => { 
    const products = connection.query(
        "SELECT ref_ikea FROM `ik__product` where ref_ikea <> ''  AND price > 0",
        async (err, result, fields) => {
            if(err){
                console.log(err)
                return reject(err)
            }
            else {
                resolve(result.map((item) => item.ref_ikea.toString()))
            }
        }
    );
})

const getPrice = async (item, country) => new Promise((resolve, reject) => { 
    const ikeaProductID = item.replace(/\D/g, '');
    const url = `https://api.ingka.ikea.com/salesitem/salesprices/ru/${country}?itemNos=${ikeaProductID}`;
    
    request({
        url: url,
        headers: {
            'x-client-id': apiKey
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            //parse body to json
            body = JSON.parse(body);

            if (body.error != undefined) {
                console.log("error on " + url + " " + body.error);
                reject(error)
            }
            else {
                resolve(body.data[0].salesPrices[0].priceInclTax);
            }
        } else {
            reject(error)
        }
    });
})

const updatePrice = async (connection, product, price) => new Promise((resolve, reject) => { 
    const sqlCommand = "UPDATE `ik__product` SET `price` = ? WHERE `ik__product`.`ref_ikea` = ?";
    connection.query(sqlCommand, [price, product], function (error, results, fields) { 
        if (error) {
            console.log(error)
            return reject(error)
        }
        resolve(results)
    })
})





// node js that makes a API request with x-client-id in the header connection
// and returns the response
async function getResponse(url, callback) {
    return new Promise(
        function (resolve, reject) { 
            request({
                url: url,
                headers: {
                    'x-client-id': apiKey
                }
            }, async function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    //console.log(body);
                    //parse body to json
                    body = JSON.parse(body);
        
                    
                    if (body.error != undefined) {
                        console.log("error on " + url + " " + body.error);
                        await callback(body.error);
                    }
                    else {
                        await callback(body.data[0].salesPrices[0].priceInclTax);
                    }
                    resolve(true)
                }
            });
        }
    )
}
function sendProductResponses(res, productsResponse) {
    let timeTaken = Date.now() - start;
    console.log("Total time taken: " + timeTaken + " milliseconds");
    res.send({ status: "ok", messages: productsResponse, timeTaken: timeTaken });
}



