import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Create uploads directory inside project root on startup
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // State management for multi-device cross-PC synchronization
  interface ServerState {
    currentAnnouncement: any | null;
    playingStatus: 'idle' | 'playing';
    volume: number;
    isTTS: boolean;
    customText: string;
    fallbackMode: boolean;
    timestamp: number;
    action: 'PLAY' | 'STOP' | 'SET_VOLUME' | 'NONE';
  }

  let systemState: ServerState = {
    currentAnnouncement: null,
    playingStatus: 'idle',
    volume: 0.8,
    isTTS: false,
    customText: '',
    fallbackMode: true,
    timestamp: 0,
    action: 'NONE'
  };

  let receiverStatus = {
    active: false,
    isAudioUnlocked: true,
    playingId: null as string | null,
    lastSeen: 0
  };

  // Serve custom MP3 uploads statically
  app.use('/uploads', express.static(uploadsDir));

  // Health endpoint checks
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Upload binary MP3 file (accepts octet-stream directly for maximum speed and simplicity)
  app.post('/api/upload', (req, res) => {
    const fileName = req.query.name as string;
    if (!fileName) {
      return res.status(400).send('No filename specified');
    }

    const filePath = path.join(uploadsDir, fileName);
    const writeStream = fs.createWriteStream(filePath);

    req.pipe(writeStream);

    writeStream.on('finish', () => {
      console.log(`Saved MP3 file successfully on server: ${fileName}`);
      res.json({ success: true, name: fileName });
    });

    writeStream.on('error', (err) => {
      console.error(`Error saving upload stream to file: ${err.message}`);
      res.status(500).send(err.message);
    });
  });

  // List all uploaded MP3 assets persists in project
  app.get('/api/uploads', (req, res) => {
    if (!fs.existsSync(uploadsDir)) {
      return res.json([]);
    }
    try {
      const files = fs.readdirSync(uploadsDir);
      const result = files
        .filter(f => f.toLowerCase().endsWith('.mp3'))
        .map(name => {
          const stats = fs.statSync(path.join(uploadsDir, name));
          return {
            name,
            size: Math.round(stats.size / 1024), // KB
            url: `/uploads/${encodeURIComponent(name)}`
          };
        });
      res.json(result);
    } catch (err: any) {
      res.status(500).send(err.message || 'Error listing uploads');
    }
  });

  // Delete custom uploaded MP3 assets physically
  app.delete('/api/uploads/:name', (req, res) => {
    const name = req.params.name;
    const filePath = path.join(uploadsDir, name);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).send(err.message || 'Error deleting file');
    }
  });

  // Operator Action (Play) -> Distribute event to remote systems
  app.post('/api/play', express.json(), (req, res) => {
    const { announcement, isCustom, volume, fallbackMode, isTTS, customText } = req.body;
    systemState = {
      currentAnnouncement: announcement,
      playingStatus: 'playing',
      volume: volume ?? 0.8,
      isTTS: isTTS ?? false,
      customText: customText ?? '',
      fallbackMode: fallbackMode ?? true,
      timestamp: Date.now(),
      action: 'PLAY'
    };
    res.json({ success: true, state: systemState });
  });

  // Operator Action (Stop)
  app.post('/api/stop', (req, res) => {
    systemState = {
      currentAnnouncement: null,
      playingStatus: 'idle',
      volume: systemState.volume,
      isTTS: false,
      customText: '',
      fallbackMode: systemState.fallbackMode,
      timestamp: Date.now(),
      action: 'STOP'
    };
    res.json({ success: true, state: systemState });
  });

  // Operator Action (Set Volume)
  app.post('/api/set-volume', express.json(), (req, res) => {
    const { volume } = req.body;
    systemState.volume = volume;
    systemState.action = 'SET_VOLUME';
    systemState.timestamp = Date.now();
    res.json({ success: true, state: systemState });
  });

  // State polling endpoint - Receiver connects and exchanges status at short intervals
  app.get('/api/state', (req, res) => {
    if (req.query.active !== undefined) {
      receiverStatus.active = req.query.active === 'true';
      receiverStatus.isAudioUnlocked = req.query.isAudioUnlocked === 'true';
      receiverStatus.playingId = (req.query.playingId as string) || null;
      receiverStatus.lastSeen = Date.now();
    }
    res.json({
      state: systemState,
      receiver: receiverStatus
    });
  });

  // Operator pulls the online status statistics of the hardware/receiver screen
  app.get('/api/receiver', (req, res) => {
    const isOnline = Date.now() - receiverStatus.lastSeen < 6000;
    res.json({
      active: isOnline && receiverStatus.active,
      isAudioUnlocked: receiverStatus.isAudioUnlocked,
      playingId: isOnline ? receiverStatus.playingId : null
    });
  });

  // Integrate Vite dev server configuration or production files
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`HMMB Full-stack sync server running on http://localhost:${PORT}`);
  });
}

startServer();
