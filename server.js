require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to Neon Postgres:', err);
  } else {
    console.log('Connected to Neon Postgres database');
    release();
  }
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        category_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(10) NOT NULL,
        icon VARCHAR(50),
        color VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create comics table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comics (
        id SERIAL PRIMARY KEY,
        comic_id VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(500) NOT NULL,
        category_id VARCHAR(50) NOT NULL,
        subcategory VARCHAR(100),
        chapter VARCHAR(50),
        rating VARCHAR(20) DEFAULT 'none',
        tags TEXT[] DEFAULT '{}',
        description TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE
      )
    `);

    // Insert default categories if empty
    const categoriesCount = await pool.query('SELECT COUNT(*) FROM categories');
    if (parseInt(categoriesCount.rows[0].count) === 0) {
      const defaultCategories = [
        ['hoc-duong', 'HỌC ĐƯỜNG', '1111', 'fas fa-school', '#6366f1'],
        ['mat-the', 'MẠT THẾ', '2222', 'fas fa-skull-crossbones', '#ef4444'],
        ['he-thong', 'HỆ THỐNG', '3333', 'fas fa-cogs', '#10b981'],
        ['xay-dung', 'XÂY DỰNG', '4444', 'fas fa-building', '#f59e0b'],
        ['di-gioi', 'DỊ GIỚI', '5555', 'fas fa-globe-asia', '#8b5cf6'],
        ['kinh-doanh', 'KINH DOANH', '6666', 'fas fa-chart-line', '#06b6d4'],
        ['trung-sinh', 'TRÙNG SINH', '7777', 'fas fa-redo', '#ec4899'],
        ['ngon', 'NGÔN', '8888', 'fas fa-heart', '#f43f5e'],
        ['tu-tien', 'TU TIÊN', 'AAA', 'fas fa-mountain', '#22c55e'],
        ['do-thi', 'ĐÔ THỊ', 'BBB', 'fas fa-city', '#3b82f6'],
        ['phan-dien', 'PHẢN DIỆN', 'CCC', 'fas fa-user-ninja', '#0ea5e9'],
        ['vo-han-luu', 'VÔ HẠN LƯU', 'EEE', 'fas fa-infinity', '#a855f7'],
        ['manh', 'MẠNH', 'DDD', 'fas fa-fist-raised', '#f97316'],
        ['quy-than', 'QUỶ THẦN', 'FFF', 'fas fa-ghost', '#6b7280'],
        ['ecchi', 'ECCHI', '9999', 'fas fa-fire', '#dc2626'],
        ['phim', 'PHIM', '0000', 'fas fa-film', '#8b5cf6']
      ];

      for (const cat of defaultCategories) {
        await pool.query(
          'INSERT INTO categories (category_id, name, code, icon, color) VALUES ($1, $2, $3, $4, $5)',
          cat
        );
      }
      console.log('Default categories inserted');
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// API Routes

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all comics with optional filtering
app.get('/api/comics', async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    let query = 'SELECT * FROM comics';
    const params = [];
    let paramCount = 0;

    if (category) {
      query += ` WHERE category_id = $${++paramCount}`;
      params.push(category);
    }

    if (search) {
      query += paramCount > 0 ? ' AND' : ' WHERE';
      query += ` (title ILIKE $${++paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY last_updated DESC';
    
    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching comics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get comics grouped by category and subcategory
app.get('/api/comics/grouped', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.category_id,
        cat.name as category_name,
        c.subcategory,
        json_agg(
          json_build_object(
            'id', c.comic_id,
            'title', c.title,
            'chapter', c.chapter,
            'rating', c.rating,
            'tags', c.tags,
            'description', c.description,
            'lastUpdated', c.last_updated
          )
        ) as items
      FROM comics c
      JOIN categories cat ON c.category_id = cat.category_id
      GROUP BY c.category_id, cat.name, c.subcategory
      ORDER BY cat.name, c.subcategory
    `);
    
    // Transform to frontend format
    const groupedData = {};
    result.rows.forEach(row => {
      if (!groupedData[row.category_id]) {
        groupedData[row.category_id] = [];
      }
      groupedData[row.category_id].push({
        subcategory: row.subcategory || '',
        items: row.items
      });
    });
    
    res.json(groupedData);
  } catch (error) {
    console.error('Error fetching grouped comics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single comic
app.get('/api/comics/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM comics WHERE comic_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching comic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new comic
app.post('/api/comics', async (req, res) => {
  try {
    const {
      title,
      category_id,
      subcategory,
      chapter,
      rating,
      tags,
      description
    } = req.body;

    // Generate unique comic ID
    const comic_id = `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await pool.query(
      `INSERT INTO comics (
        comic_id, title, category_id, subcategory, 
        chapter, rating, tags, description, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        comic_id,
        title,
        category_id,
        subcategory || '',
        chapter,
        rating || 'none',
        tags || [],
        description || ''
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding comic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update comic
app.put('/api/comics/:id', async (req, res) => {
  try {
    const {
      chapter,
      rating,
      title,
      tags,
      description
    } = req.body;

    const result = await pool.query(
      `UPDATE comics 
       SET chapter = COALESCE($1, chapter),
           rating = COALESCE($2, rating),
           title = COALESCE($3, title),
           tags = COALESCE($4, tags),
           description = COALESCE($5, description),
           last_updated = NOW()
       WHERE comic_id = $6
       RETURNING *`,
      [chapter, rating, title, tags, description, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating comic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update only chapter
app.patch('/api/comics/:id/chapter', async (req, res) => {
  try {
    const { chapter } = req.body;
    
    const result = await pool.query(
      `UPDATE comics 
       SET chapter = $1, last_updated = NOW()
       WHERE comic_id = $2
       RETURNING *`,
      [chapter, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating chapter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete comic
app.delete('/api/comics/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM comics WHERE comic_id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comic not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting comic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stats
app.get('/api/stats', async (req, res) => {
  try {
    const totalComics = await pool.query('SELECT COUNT(*) FROM comics');
    const totalCategories = await pool.query('SELECT COUNT(*) FROM categories');
    const readingCount = await pool.query(`
      SELECT COUNT(*) FROM comics 
      WHERE chapter IS NOT NULL AND chapter != '' AND chapter != '0'
    `);

    res.json({
      totalItems: parseInt(totalComics.rows[0].count),
      totalCategories: parseInt(totalCategories.rows[0].count),
      readingCount: parseInt(readingCount.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Import data in bulk
app.post('/api/comics/import', async (req, res) => {
  try {
    const { comics } = req.body;
    
    if (!Array.isArray(comics)) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    const imported = [];
    for (const comic of comics) {
      const comic_id = `comic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const result = await pool.query(
        `INSERT INTO comics (
          comic_id, title, category_id, subcategory, 
          chapter, rating, tags, description, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (title, category_id) 
        DO UPDATE SET 
          chapter = EXCLUDED.chapter,
          rating = EXCLUDED.rating,
          last_updated = NOW()
        RETURNING *`,
        [
          comic_id,
          comic.title,
          comic.category_id,
          comic.subcategory || '',
          comic.chapter,
          comic.rating || 'none',
          comic.tags || [],
          comic.description || ''
        ]
      );
      
      imported.push(result.rows[0]);
    }

    res.json({ 
      message: `Successfully imported ${imported.length} comics`,
      imported 
    });
  } catch (error) {
    console.error('Error importing comics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Thêm route này vào server.js (trước app.listen)
app.get('/', (req, res) => {
    res.json({
        message: 'Comic Library API',
        endpoints: {
            categories: '/api/categories',
            comics: '/api/comics',
            stats: '/api/stats',
            health: '/health'
        },
        version: '1.0.0'
    });
});

// Hoặc nếu muốn redirect đến docs
app.get('/', (req, res) => {
    res.redirect('https://github.com/your-username/comic-library');
});

// Start server
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  await initializeDatabase();
});