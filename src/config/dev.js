if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

module.exports = {
  mongoURI:
    process.env.MONGO_URI ||
    'mongodb+srv://gianpietro:Q3T4paRspMKAgxSk@emaily.osac0.mongodb.net/humanidadesdigitales?retryWrites=true&w=majority',
  host: process.env.DBHOST || '35.231.120.147',
  user: process.env.USERDB || 'root',
  password: process.env.PASSWORDDB || 'g14np13tr0',
  database: process.env.DBNAME || 'humanidadesdigitales',
  port: process.env.DBPORT || '3306',
};
