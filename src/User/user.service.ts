import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, IsNull } from 'typeorm';
import { Utilisateur } from './entities/utilisateur.entity';
import { CreateUserDto } from '../auth/dto/create-user.dto';
import { FilterUsersDto } from './dto/filter-users.dto';
import { Role } from '../utils/enums/enums';
import * as bcrypt from 'bcrypt';
import { UpdateUtilisateurDto } from './dto/updateUtilisateur.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Utilisateur)
    private userRepository: Repository<Utilisateur>
  ) {}

  async create(createUserDto: CreateUserDto): Promise<Utilisateur> {
    const { telephone, email, motDePasse, ...userData } = createUserDto;

    // Vérifier si le téléphone existe déjà (incluant les utilisateurs supprimés)
    const existingUser = await this.userRepository.findOne({
      where: { telephone },
      withDeleted: true
    });

    if (existingUser) {
      throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
    }

    // Vérifier si l'email existe déjà (si fourni)
    if (email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email },
        withDeleted: true
      });
      if (existingEmail) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(motDePasse, 10);

    const user = this.userRepository.create({
      ...userData,
      telephone,
      email,
      motDePasse: hashedPassword,
      isActif: true
    });

    return await this.userRepository.save(user);
  }

  async findByPhone(telephone: string): Promise<Utilisateur | null> {
    // Cherche seulement les utilisateurs non supprimés
    return await this.userRepository.findOne({
      where: { telephone, delete_at: IsNull() }
    });
  }

  async findByPhoneWithDeleted(telephone: string): Promise<Utilisateur | null> {
    // Cherche tous les utilisateurs (supprimés ou non)
    return await this.userRepository.findOne({
      where: { telephone },
      withDeleted: true
    });
  }

  async findById(id: string): Promise<Utilisateur> {
    // Cherche seulement les utilisateurs non supprimés
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: id, delete_at: IsNull() }
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return user;
  }

async findByEmail(email: string): Promise<Utilisateur | null> {
  return this.userRepository.findOne({ where: { email, delete_at: IsNull() } });
}

async findByI(id: string): Promise<Utilisateur | null> {
  return this.userRepository.findOne({ where: { idUtilisateur: id, delete_at: IsNull() } });
}


  async findByIdWithDeleted(id: string): Promise<Utilisateur> {
    // Cherche tous les utilisateurs (supprimés ou non) - utile pour la restauration
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: id },
      withDeleted: true
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return user;
  }

  async updatePassword(id: string, nouveauMotDePasse: string): Promise<void> {
    // Vérifier que l'utilisateur existe et n'est pas supprimé
    await this.findById(id);
    
    const hashedPassword = await bcrypt.hash(nouveauMotDePasse, 10);
    await this.userRepository.update(id, { motDePasse: hashedPassword });
  }

  async toggleActivation(id: string): Promise<Utilisateur> {
    const user = await this.findById(id);
    user.isActif = !user.isActif;
    return await this.userRepository.save(user);
  }

  // Suppression logique - met à jour delete_at avec la date actuelle
  async softDelete(id: string): Promise<void> {
    // Vérifier que l'utilisateur existe et n'est pas déjà supprimé
    const user = await this.findById(id);
    
    // TypeORM softDelete() met automatiquement à jour le champ @DeleteDateColumn
    const result = await this.userRepository.softDelete(id);
    
    if (result.affected === 0) {
      throw new NotFoundException('Impossible de supprimer l\'utilisateur');
    }
  }

  // Restauration d'un utilisateur supprimé
  async restore(id: string): Promise<Utilisateur> {
    // Vérifier que l'utilisateur existe (même supprimé)
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: id },
      withDeleted: true
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (!user.delete_at) {
      throw new ConflictException('L\'utilisateur n\'est pas supprimé');
    }

    // TypeORM restore() remet delete_at à null
    const result = await this.userRepository.restore(id);
    
    if (result.affected === 0) {
      throw new NotFoundException('Impossible de restaurer l\'utilisateur');
    }

    // Retourner l'utilisateur restauré
    return await this.findById(id);
  }

  // Récupérer tous les utilisateurs (seulement ceux non supprimés)
  async findAll(filterDto: FilterUsersDto): Promise<{ users: Utilisateur[], total: number }> {
    const { role, email, nom, search, page = '1', limit = '10' } = filterDto;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const queryBuilder = this.userRepository.createQueryBuilder('user')
      .where('user.delete_at IS NULL'); // Seulement les utilisateurs non supprimés

    // Filtres
    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (email) {
      queryBuilder.andWhere('user.email LIKE :email', { email: `%${email}%` });
    }

    if (nom) {
      queryBuilder.andWhere('user.nom LIKE :nom', { nom: `%${nom}%` });
    }

    // Recherche globale
    if (search) {
      queryBuilder.andWhere(
        '(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [users, total] = await queryBuilder
      .skip(skip)
      .take(parseInt(limit))
      .getManyAndCount();

    return { users, total };
  }

  // Récupérer tous les utilisateurs supprimés
  async findAllDeleted(filterDto: FilterUsersDto): Promise<{ users: Utilisateur[], total: number }> {
    const { role, email, nom, search, page = '1', limit = '10' } = filterDto;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const queryBuilder = this.userRepository.createQueryBuilder('user')
      .where('user.delete_at IS NOT NULL') // Seulement les utilisateurs supprimés
      .withDeleted(); // Important pour inclure les entités supprimées

    // Filtres
    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (email) {
      queryBuilder.andWhere('user.email LIKE :email', { email: `%${email}%` });
    }

    if (nom) {
      queryBuilder.andWhere('user.nom LIKE :nom', { nom: `%${nom}%` });
    }

    // Recherche globale
    if (search) {
      queryBuilder.andWhere(
        '(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [users, total] = await queryBuilder
      .skip(skip)
      .take(parseInt(limit))
      .getManyAndCount();

    return { users, total };
  }

  // Récupérer tous les utilisateurs (supprimés et non supprimés)
  async findAllWithDeleted(filterDto: FilterUsersDto): Promise<{ users: Utilisateur[], total: number }> {
    const { role, email, nom, search, page = '1', limit = '10' } = filterDto;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const queryBuilder = this.userRepository.createQueryBuilder('user')
      .withDeleted(); // Inclure tous les utilisateurs

    // Filtres
    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (email) {
      queryBuilder.andWhere('user.email LIKE :email', { email: `%${email}%` });
    }

    if (nom) {
      queryBuilder.andWhere('user.nom LIKE :nom', { nom: `%${nom}%` });
    }

    // Recherche globale
    if (search) {
      queryBuilder.andWhere(
        '(user.nom LIKE :search OR user.email LIKE :search OR user.telephone LIKE :search)',
        { search: `%${search}%` }
      );
    }

    

    const [users, total] = await queryBuilder
      .skip(skip)
      .take(parseInt(limit))
      .getManyAndCount();

    return { users, total };
  }

   async updateUtilisateur(id: string, dto: UpdateUtilisateurDto) {
    const utilisateur = await this.userRepository.findOne({
    where: {
    idUtilisateur: id,
    delete_at: IsNull(),
  },
});

    if (!utilisateur) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (dto.email && dto.email !== utilisateur.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
    }

    if (dto.telephone && dto.telephone !== utilisateur.telephone) {
      const existingPhone = await this.userRepository.findOne({
        where: { telephone: dto.telephone },
      });
      if (existingPhone) {
        throw new ConflictException('Ce numéro est déjà utilisé');
      }
    }

    if (dto.motDePasse) {
      dto.motDePasse = await bcrypt.hash(dto.motDePasse, 10);
    }

    Object.assign(utilisateur, dto);
    return await this.userRepository.save(utilisateur);
  }


  async updatePhone(userId: string, newPhone: string): Promise<void> {
    // Vérifier que l'utilisateur existe
    const user = await this.userRepository.findOne({
      where: { idUtilisateur: userId }
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Mettre à jour le numéro de téléphone
    await this.userRepository.update(userId, {
      telephone: newPhone
    });
  }

    async getMe(userId: string): Promise<Partial<Utilisateur>> {
    const utilisateur = await this.userRepository.findOne({
      where: { idUtilisateur: userId },
      select: {
        idUtilisateur: true,
        nom: true,
        email: true,
        telephone: true,
        role: true,
        isActif: true,
      },
    });

    if (!utilisateur) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return utilisateur;
  }
}