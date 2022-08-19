module.exports = {
  mongoURI: process.env.MONGO_URI,
  host: process.env.DBHOST || 'localhost',
  user: process.env.USERDB || 'root',
  password: process.env.PASSWORDDB || 'root',
  database: process.env.DBNAME || 'db',
  port: process.env.DBPORT || '3306',
};
