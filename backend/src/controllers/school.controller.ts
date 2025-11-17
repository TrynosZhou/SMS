import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { School } from '../entities/School';
import { AuthRequest } from '../middleware/auth';

export const listSchools = async (_req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const schoolRepository = AppDataSource.getRepository(School);
    const schools = await schoolRepository.find({ order: { name: 'ASC' } });
    res.json(schools);
  } catch (error) {
    console.error('Error listing schools:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const createSchool = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { name, code, logoUrl, address, phone, subscriptionEndDate } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: 'Name and code are required' });
    }

    const schoolRepository = AppDataSource.getRepository(School);
    const existingSchool = await schoolRepository.findOne({
      where: [{ schoolid: code.trim().toLowerCase() }, { name: name.trim() }]
    });

    if (existingSchool) {
      return res.status(400).json({ message: 'A school with that code or name already exists' });
    }

    const school = schoolRepository.create({
      name: name.trim(),
      schoolid: code.trim().toLowerCase(),
      logoUrl: logoUrl?.trim() || null,
      address: address?.trim() || null,
      phone: phone?.trim() || null,
      subscriptionEndDate: subscriptionEndDate ? new Date(subscriptionEndDate) : null
    });

    await schoolRepository.save(school);
    res.status(201).json({ message: 'School created successfully', school });
  } catch (error) {
    console.error('Error creating school:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateSchool = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const { id } = req.params;
    const { name, code, logoUrl, address, phone, subscriptionEndDate, isActive } = req.body;
    const schoolRepository = AppDataSource.getRepository(School);
    const school = await schoolRepository.findOne({ where: { id } });

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    if (name !== undefined) {
      school.name = name.trim();
    }
    if (code !== undefined) {
      school.schoolid = code.trim().toLowerCase();
    }
    if (logoUrl !== undefined) {
      school.logoUrl = logoUrl?.trim() || null;
    }
    if (address !== undefined) {
      school.address = address?.trim() || null;
    }
    if (phone !== undefined) {
      school.phone = phone?.trim() || null;
    }
    if (subscriptionEndDate !== undefined) {
      school.subscriptionEndDate = subscriptionEndDate ? new Date(subscriptionEndDate) : null;
    }
    if (isActive !== undefined) {
      school.isActive = Boolean(isActive);
    }

    await schoolRepository.save(school);
    res.json({ message: 'School updated successfully', school });
  } catch (error) {
    console.error('Error updating school:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getCurrentSchoolProfile = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const schoolId = req.schoolId || req.user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ message: 'School context missing' });
    }

    const schoolRepository = AppDataSource.getRepository(School);
    const school = await schoolRepository.findOne({ where: { id: schoolId } });

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    res.json(school);
  } catch (error) {
    console.error('Error fetching school profile:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

export const generateSchoolCode = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.isDemo) {
      return res.status(403).json({ message: 'Demo accounts cannot generate school codes.' });
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const schoolRepository = AppDataSource.getRepository(School);
    const generateCandidate = () => {
      const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
      return `TZ${digits}`;
    };

    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = generateCandidate();
      const existing = await schoolRepository.findOne({
        where: { schoolid: candidate.toLowerCase() }
      });
      if (!existing) {
        return res.json({ code: candidate });
      }
    }

    return res.status(500).json({
      message: 'Unable to generate a unique school code right now. Please try again.'
    });
  } catch (error) {
    console.error('Error generating school code:', error);
    res.status(500).json({ message: 'Server error', error });
  }
};

