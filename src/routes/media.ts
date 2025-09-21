import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed') as any, false);
    }
  },
});

// Validation schemas
const mediaUploadSchema = z.object({
  type: z.enum(['avatar', 'message', 'convoy']).optional().default('message'),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  duration: z.coerce.number().min(0).optional()
});

// POST /media/upload
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: {
          code: 'NO_FILE',
          message: 'No file provided'
        }
      });
    }

    const { type, width, height, duration } = mediaUploadSchema.parse(req.body);
    const file = req.file;

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop() || 'bin';
    const filename = `${uuidv4()}.${fileExtension}`;

    // TODO: Upload to S3/R2 storage
    // For now, we'll simulate the upload and return a mock URL
    const mockUrl = `https://storage.example.com/uploads/${filename}`;

    // Determine file type
    let mediaType: 'image' | 'video' | 'audio' = 'image';
    if (file.mimetype.startsWith('video/')) {
      mediaType = 'video';
    } else if (file.mimetype.startsWith('audio/')) {
      mediaType = 'audio';
    }

    // TODO: Extract actual dimensions and duration from file
    const response = {
      url: mockUrl,
      type: mediaType,
      width: width || (mediaType === 'image' ? 1920 : undefined),
      height: height || (mediaType === 'image' ? 1080 : undefined),
      duration: duration || (mediaType === 'video' ? 60 : undefined),
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors
        }
      });
    }

    if (error.message === 'Only image and video files are allowed') {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Only image and video files are allowed'
        }
      });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds 50MB limit'
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to upload file'
      }
    });
  }
});

// POST /media/upload-multiple
router.post('/upload-multiple', requireAuth, upload.array('files', 5), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated'
        }
      });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_FILES',
          message: 'No files provided'
        }
      });
    }

    const uploadPromises = files.map(file => {
      // Generate unique filename
      const fileExtension = file.originalname.split('.').pop() || 'bin';
      const filename = `${uuidv4()}.${fileExtension}`;

      // TODO: Upload to S3/R2 storage
      const mockUrl = `https://storage.example.com/uploads/${filename}`;

      // Determine file type
      let mediaType: 'image' | 'video' | 'audio' = 'image';
      if (file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.mimetype.startsWith('audio/')) {
        mediaType = 'audio';
      }

      return {
        url: mockUrl,
        type: mediaType,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    res.json({
      success: true,
      data: {
        files: uploadedFiles,
        count: uploadedFiles.length
      }
    });
  } catch (error: any) {
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: {
          code: 'TOO_MANY_FILES',
          message: 'Maximum 5 files allowed'
        }
      });
    }

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to upload files'
      }
    });
  }
});

export default router;
