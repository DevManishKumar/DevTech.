const express = require("express");
const cors = require("cors");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// db connection
const pool = new Pool({
  user: "postgres",
  host: "127.0.0.1",
  database: "blog",
  password: "mk@18064464",
  port: 5432,
});

app.use(cors());

// Schema
const schema = buildSchema(`
  type User {
    id: Int!
    email: String!
  }

  type BlogPost {
    id: Int!
    title: String!
    description: String!
    imageUrl: String
    userId: Int!
  }

  type Query {
    getUser(id: Int!): User
    getBlogPost(id: Int!): BlogPost
    getBlogPosts: [BlogPost]
  }

  type Mutation {
    register(firstName:String!, lastName:String!, email: String!, password: String!): String
    login(email: String!, password: String!): String
    createBlogPost(
      title: String!
      description: String!
      imageUrl: String
    ): BlogPost
    updateBlogPost(
      id: Int!
      title: String!
      description: String!
      imageUrl: String
    ): BlogPost
    deleteBlogPost(id: Int!): Boolean
  }
`);

// Resolvers
const root = {
  register: async ({ firstName, lastName, email, password }) => {
    if(!email || !password || !firstName || !lastName){
      throw new Error("Please provide all required field.")
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const query =
      "INSERT INTO users (firstName, lastName, email, password) VALUES ($1, $2, $3, $4) RETURNING id";
    const values = [firstName, lastName, email, hashedPassword];
    const result = await pool.query(query, values);
    const userId = result.rows[0].id;
    return userId;
  },

  login: async ({ email, password }) => {
    if(!email && !password){
      throw new Error("Please provide email and password.")
    }
    const query = "SELECT * FROM users WHERE email = $1";
    const values = [email];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("User not found.");
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error("Invalid password.");
    }

    const token = jwt.sign({ userId: user.id }, process.env.jwt_secret, {
      expiresIn: "1h",
    });
    return token;
  },


  createBlogPost: async ({ title, description, imageUrl }, context) => {
    if (!context.userId) {
      throw new Error("Authentication required.");
    }

    const query =
      "INSERT INTO blog_posts (title, description, image_url, user_id) VALUES ($1, $2, $3, $4) RETURNING *";
    const values = [title, description, imageUrl, context.userId];
    const result = await pool.query(query, values);
    return result.rows[0];
  },
  updateBlogPost: async ({ id, title, description, imageUrl }, context) => {
    if (!context.userId) {
      throw new Error("Authentication required.");
    }

    const query =
      "UPDATE blog_posts SET title = $1, description = $2, image_url = $3 WHERE id = $4 AND user_id = $5 RETURNING *";
    const values = [title, description, imageUrl, id, context.userId];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("Blog post not found or unauthorized.");
    }

    return result.rows[0];
  },

  deleteBlogPost: async ({ id }, context) => {
    if (!context.userId) {
      throw new Error("Authentication required.");
    }

    const query = "DELETE FROM blog_posts WHERE id = $1 AND user_id = $2";
    const values = [id, context.userId];
    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      throw new Error("Blog post not found or unauthorized.");
    }

    return true;
  },

  getBlogPosts: async () => {
    const query = "SELECT * FROM blog_posts";
    const result = await pool.query(query);
    return result.rows;
  },

  getBlogPost: async ({ id }) => {
    const query = "SELECT * FROM blog_posts WHERE id = $1";
    const values = [id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error("Blog post not found.");
    }

    return result.rows[0];
  },
};

// Middleware for verifying JWT tokens
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    req.context = {};
    next();
    return;
  }

  jwt.verify(token, process.env.jwt_secret, (err, decoded) => {
    if (err) {
      req.context = {};
    } else {
      req.context = { userId: decoded.userId };
    }
    next();
  });
};

app.use(authMiddleware);

app.use(
  "/graphql",
  graphqlHTTP((req) => ({
    schema: schema,
    rootValue: root,
    graphiql: true,
    context: req.context,
  }))
);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
