import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../User/user.service';
import { TwilioService } from '../twillio/twillio.service';
import { CacheService } from '../cache/cache.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Role } from '../utils/enums/enums';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
import { UpdatePhoneDto } from './dto/updatePhone.dto';
import { VerifyPhoneDto } from './dto/VerifyPhone.dto';
import { UpdatePasswordDto } from './dto/updatePassword.dto';



@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private twilioService: TwilioService,
    private cacheService: CacheService,
    private configService: ConfigService
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
        
    );
  }

 private generateSecurePassword(): string {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let password = '';
    
    // S'assurer qu'on a au moins un caractère de chaque type requis
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Remplir le reste avec des caractères aléatoires
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = 3; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Mélanger le mot de passe
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  }

  private generateTokens(userId: string, phone: string, role: Role) {
    const payload = { sub: userId, phone, role };
    
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m'
    });
    
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d'
    });

    return { accessToken, refreshToken };
  }


 async register(registerDto: RegisterDto) {
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await this.usersService.findByPhone(registerDto.telephone);
    if (existingUser) {
      throw new ConflictException('Un utilisateur avec ce numéro existe déjà');
    }

    // Générer le code de vérification
    const verificationCode = this.twilioService.generateVerificationCode();
    
    // Stocker les données d'enregistrement temporairement (5 minutes)
    const tempKey = `registration_${registerDto.telephone}`;
    await this.cacheService.set(tempKey, {
      ...registerDto,
      verificationCode,
      role: Role.ADMIN
    }, 300); 

    // Envoyer le SMS de vérification
    await this.twilioService.sendSMS(
      registerDto.telephone,
      `Votre code de vérification est: ${verificationCode}`
    );

    return {
      message: 'Code de vérification envoyé par SMS',
      phone: registerDto.telephone
    };
  }


async login(loginDto: LoginDto) {
  const { telephone, motDePasse } = loginDto;
  
  const user = await this.usersService.findByPhone(telephone);
  if (!user) {
    throw new UnauthorizedException('Identifiants invalides');
  }

  if (!user.isActif) {
    throw new UnauthorizedException('Compte désactivé');
  }

  const isPasswordValid = await bcrypt.compare(motDePasse, user.motDePasse);
  if (!isPasswordValid) {
    throw new UnauthorizedException('Identifiants invalides');
  }

  const { motDePasse: _, ...userWithoutPassword } = user;
  const tokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role);

  // Stocker le refresh token dans le cache
  await this.cacheService.set(
    `refresh_token_${user.idUtilisateur}`, 
    tokens.refreshToken, 
    604800 // 7 jours en secondes
  );

  // Retourner seulement l'utilisateur et les tokens (sans les inclure dans la réponse JSON)
  return {
    user: userWithoutPassword,
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  };
}

  getGoogleAuthUrl(): string {
  return this.googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    redirect_uri: this.configService.get('GOOGLE_CALLBACK_URL'), // Doit être exact
    state: 'admin',
    prompt: 'consent' // Force la demande de permissions
  });
}

  // Générer l'URL d'autorisation pour les employés
  getGoogleEmployeeAuthUrl(): string {
    const authUrl = this.googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      redirect_uri: this.configService.get('GOOGLE_EMPLOYEE_CALLBACK_URL'),
      state: 'employee', // Pour identifier le type de connexion
    });
    return authUrl;
  }

 async googleCallback(code: string, state: string) {
  try {
    // Créer un nouveau client avec le redirect_uri correct
    const googleClient = new OAuth2Client(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_CALLBACK_URL')
    );

    // Échanger le code contre les tokens
    const tokenResponse = await googleClient.getToken(code);
    const tokens = tokenResponse.tokens;
    googleClient.setCredentials(tokens);

    if (!tokens.id_token) {
      throw new UnauthorizedException('No ID token provided by Google');
    }

    // Obtenir les informations utilisateur
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.configService.get('GOOGLE_CLIENT_ID'),
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Token Google invalide');
    }

    const { email, name, sub: googleId } = payload;
    if (!email) {
      throw new UnauthorizedException('Aucun email n\'a pas été fourni par Google');
    }

    // Chercher l'utilisateur par email
    let user = await this.usersService.findByEmail(email);
    if (!user) {
      // Créer un nouvel utilisateur ADMIN lors de l'inscription via Google
      const createUserDto: CreateUserDto = {
        nom: name ?? email.split('@')[0],
        email,
        telephone: `google_${googleId}`,
        role: Role.ADMIN,
        motDePasse: `googleoauth_${googleId}`
      };
      user = await this.usersService.create(createUserDto);
    }

    if (!user.isActif) {
      throw new UnauthorizedException('Compte désactivé');
    }

    const { motDePasse, ...userWithoutPassword } = user;
    const authTokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role);

    // Stocker le refresh token dans le cache
    await this.cacheService.set(
      `refreshtoken_${user.idUtilisateur}`,
      authTokens.refreshToken,
      604800 // 7 jours en secondes
    );

    return {
      user: userWithoutPassword,
      tokens: {
        accessToken: authTokens.accessToken,
        refreshToken: authTokens.refreshToken
      }
    };
  } catch (error) {
    console.error('Erreur Google OAuth Callback:', error);
    throw new UnauthorizedException('Authentification Google échouée');
  }
}

async googleEmployeeCallback(code: string, state: string) {
  try {
    // Créer un nouveau client avec le redirect_uri correct
    const googleClient = new OAuth2Client(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_EMPLOYEE_CALLBACK_URL')
    );

    // Échanger le code contre les tokens
    const tokenResponse = await googleClient.getToken(code);
    const tokens = tokenResponse.tokens;
    googleClient.setCredentials(tokens);

    if (!tokens.id_token) {
      throw new UnauthorizedException('No ID token provided by Google');
    }

    // Obtenir les informations utilisateur
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.configService.get('GOOGLE_CLIENT_ID'),
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Token Google invalide');
    }

    const { email } = payload;
    if (!email) {
      throw new UnauthorizedException('Aucun email n\'a pas été fourni par Google');
    }

    // Chercher UNIQUEMENT l'utilisateur existant par email
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Compte non trouvé. Votre compte doit être créé par un administrateur.');
    }

    // Vérifier que c'est un employé ou manager (pas admin)
    if (user.role === Role.ADMIN) {
      throw new UnauthorizedException('Les administrateurs doivent utiliser l\'authentification principale');
    }

    if (!user.isActif) {
      throw new UnauthorizedException('Compte désactivé');
    }

    const { motDePasse, ...userWithoutPassword } = user;
    const authTokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role);

    // Stocker le refresh token dans le cache
    await this.cacheService.set(
      `refreshtoken_${user.idUtilisateur}`,
      authTokens.refreshToken,
      604800 // 7 jours en secondes
    );

    return {
      user: userWithoutPassword,
      tokens: {
        accessToken: authTokens.accessToken,
        refreshToken: authTokens.refreshToken
      }
    };
  } catch (error) {
    console.error('Erreur Google OAuth Employee Callback:', error);
    throw new UnauthorizedException('Authentification Google échouée');
  }
}




 async refreshToken(refreshTokenDto: RefreshTokenDto) {
  try {
    const { refreshToken } = refreshTokenDto;
    
    // Vérifier le refresh token
    const decoded = this.jwtService.verify(refreshToken);
    const userId = decoded.sub;

    // Vérifier que le refresh token existe dans le cache
    const storedToken = await this.cacheService.get(`refresh_token_${userId}`);
    if (!storedToken || storedToken !== refreshToken) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    // Récupérer l'utilisateur
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActif) {
      throw new UnauthorizedException('Utilisateur non trouvé ou inactif');
    }

    // Générer de nouveaux tokens
    const tokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role);

    // Mettre à jour le refresh token dans le cache
    await this.cacheService.del(`refresh_token_${userId}`);
    await this.cacheService.set(
      `refresh_token_${userId}`, 
      tokens.refreshToken, 
      604800 // 7 jours en secondes
    );

    return {
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    };

  } catch (error) {
    throw new UnauthorizedException('Refresh token invalide ou expiré');
  }
}


  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { telephone } = forgotPasswordDto;
    
    const user = await this.usersService.findByPhone(telephone);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    
    // Vérifier si c'est un ADMIN
    if (user.role !== Role.ADMIN) {
      throw new BadRequestException('Cette fonctionnalité est réservée aux administrateurs');
    }
    
    // Générer code de vérification
    const verificationCode = this.twilioService.generateVerificationCode();
    console.log(`Code généré pour ${telephone}: ${verificationCode}`);
    
    // Stocker dans le cache (expire en 10 minutes = 600 secondes)
    const cacheKey = `reset_password_${telephone}`;
    const ttlSeconds = 600; // 10 minutes
    
    try {
      await this.cacheService.set(cacheKey, verificationCode, ttlSeconds);
      console.log(`Code stocké dans le cache avec la clé: ${cacheKey}`);
      
      // Vérifier immédiatement que le code est bien stocké
      const storedCode = await this.cacheService.get(cacheKey);
      console.log(`Code récupéré immédiatement: ${storedCode}`);
      
      if (!storedCode) {
        throw new Error('Erreur lors du stockage du code dans le cache');
      }
      
    } catch (error) {
      console.error('Erreur cache:', error);
      throw new BadRequestException('Erreur lors de la génération du code');
    }
    
    // Envoyer SMS
    const message = `Votre code de réinitialisation: ${verificationCode}. Ce code expire dans 10 minutes.`;
    
    try {
      await this.twilioService.sendSMS(telephone, message);
      console.log(`SMS envoyé à ${telephone}`);
    } catch (error) {
      console.error('Erreur SMS:', error);
      // Supprimer le code du cache si l'envoi SMS échoue
      await this.cacheService.del(cacheKey);
      throw new BadRequestException('Erreur lors de l\'envoi du SMS');
    }
    
    return { 
      message: 'Code de vérification envoyé par SMS',
      debug: {
        codeGenerated: verificationCode,
        cacheKey: cacheKey,
        ttl: ttlSeconds
      }
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { telephone, codeVerification, nouveauMotDePasse } = resetPasswordDto;
    
    const cacheKey = `reset_password_${telephone}`;
    
    // Debug: vérifier l'existence de la clé
    console.log(`Tentative de récupération du code pour: ${cacheKey}`);
    
    // Vérifier le code de vérification
    const storedCode = await this.cacheService.get(cacheKey);
    console.log(`Code stocké: ${storedCode}, Code fourni: ${codeVerification}`);
    
    if (!storedCode) {
      console.log('Aucun code trouvé dans le cache');
      throw new BadRequestException('Code de vérification expiré ou inexistant');
    }
    
    if (storedCode !== codeVerification) {
      console.log('Code de vérification incorrect');
      throw new BadRequestException('Code de vérification invalide');
    }
    
    const user = await this.usersService.findByPhone(telephone);
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    
    try {
      // Mettre à jour le mot de passe
      await this.usersService.updatePassword(user.idUtilisateur, nouveauMotDePasse);
      
      // Supprimer le code du cache
      await this.cacheService.del(cacheKey);
      console.log(`Code supprimé du cache: ${cacheKey}`);
      
      return { message: 'Mot de passe réinitialisé avec succès' };
      
    } catch (error) {
      console.error('Erreur lors de la réinitialisation:', error);
      throw new BadRequestException('Erreur lors de la réinitialisation du mot de passe');
    }
  }

  async createUser(createUserDto: CreateUserDto, adminId: string) {
    // Vérifier que l'admin existe et est actif
    const admin = await this.usersService.findById(adminId);
    if (admin.role !== Role.ADMIN) {
      throw new UnauthorizedException('Seuls les administrateurs peuvent créer des utilisateurs');
    }

    // Générer un mot de passe automatiquement
    const generatedPassword = this.generateSecurePassword();
    
    const userDataWithPassword: CreateUserDto = {
      ...createUserDto,
      motDePasse: generatedPassword
    };

    const user = await this.usersService.create(userDataWithPassword);
    const { motDePasse, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      generatedPassword // Retourner le mot de passe généré pour l'admin
    };
  }

  async logout(token: string, userId?: string) {
    try {
      // Ajouter le token à la blacklist
      const decoded = this.jwtService.decode(token);
      if (decoded && typeof decoded === 'object' && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        await this.cacheService.set(`blacklist_${token}`, true, ttl);
      }

      // Supprimer le refresh token si userId est fourni
      if (userId) {
        await this.cacheService.del(`refresh_token_${userId}`);
      }

      return { message: 'Déconnexion réussie' };
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
      return { message: 'Déconnexion réussie' }; // Toujours retourner succès pour la déconnexion
    }
  }

async verifyPhoneAndRegister(verifyPhoneDto: VerifyPhoneDto) {
  const tempKey = `registration_${verifyPhoneDto.code}`;
  const registrationData = await this.cacheService.get(tempKey);
 
  if (!registrationData) {
    throw new BadRequestException('Code de vérification expiré ou invalide');
  }
 
  if (registrationData.verificationCode !== verifyPhoneDto.code) {
    throw new BadRequestException('Code de vérification incorrect');
  }
 
  // Utiliser le mot de passe original au lieu d'en générer un nouveau
  const createUserDto: CreateUserDto = {
    ...registrationData,
    motDePasse: registrationData.motDePasse // Utiliser le mot de passe original
  };
 
  // Créer l'utilisateur
  const user = await this.usersService.create(createUserDto);
  const { motDePasse, ...userWithoutPassword } = user;
 
  // Générer les tokens
  const tokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role);
 
  // Stocker le refresh token dans le cache
  await this.cacheService.set(
    `refresh_token_${user.idUtilisateur}`,
    tokens.refreshToken,
    604800 // 7 jours en secondes
  );
 
  // Supprimer les données temporaires
  await this.cacheService.del(tempKey);
 
  return {
    user: userWithoutPassword,
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }
  };
}

  // Mettre à jour le mot de passe
  async updatePassword(userId: string, updatePasswordDto: UpdatePasswordDto) {
    const user = await this.usersService.findById(userId);
    
    // Vérifier l'ancien mot de passe
    const isOldPasswordValid = await bcrypt.compare(
      updatePasswordDto.ancienMotDePasse, 
      user.motDePasse
    );
    
    if (!isOldPasswordValid) {
      throw new BadRequestException('Ancien mot de passe incorrect');
    }

    // Mettre à jour le mot de passe
    await this.usersService.updatePassword(userId, updatePasswordDto.nouveauMotDePasse);

    return { message: 'Mot de passe mis à jour avec succès' };
  }

  // Mettre à jour le numéro de téléphone avec vérification SMS
  async updatePhoneNumber(userId: string, updatePhoneDto: UpdatePhoneDto) {
    // Vérifier si le nouveau numéro n'est pas déjà utilisé
    const existingUser = await this.usersService.findByPhone(updatePhoneDto.nouveauTelephone);
    if (existingUser && existingUser.idUtilisateur !== userId) {
      throw new ConflictException('Ce numéro de téléphone est déjà utilisé');
    }

    // Générer le code de vérification
    const verificationCode = this.twilioService.generateVerificationCode();
    
    // Stocker temporairement la demande de changement
    const tempKey = `phone_update_${userId}`;
    await this.cacheService.set(tempKey, {
      userId,
      nouveauTelephone: updatePhoneDto.nouveauTelephone,
      verificationCode
    }, 1800); // 30 minutes

    // Envoyer le SMS au nouveau numéro
    await this.twilioService.sendSMS(
      updatePhoneDto.nouveauTelephone,
      `Votre code de vérification pour changer de numéro est: ${verificationCode}`
    );

    return {
      message: 'Code de vérification envoyé au nouveau numéro',
      phone: updatePhoneDto.nouveauTelephone
    };
  }

  // Vérifier le code SMS et finaliser le changement de numéro
  async verifyAndUpdatePhone(userId: string, verifyPhoneDto: VerifyPhoneDto) {
    const tempKey = `phone_update_${userId}`;
    const updateData = await this.cacheService.get(tempKey);

    if (!updateData) {
      throw new BadRequestException('Code de vérification expiré ou invalide');
    }

    if (updateData.verificationCode !== verifyPhoneDto.code) {
      throw new BadRequestException('Code de vérification incorrect');
    }

    // Mettre à jour le numéro de téléphone
    await this.usersService.updatePhone(userId, updateData.nouveauTelephone);

    // Supprimer les données temporaires
    await this.cacheService.del(tempKey);

    // Invalider tous les tokens existants pour forcer une nouvelle connexion
    await this.cacheService.del(`refresh_token_${userId}`);

    return { message: 'Numéro de téléphone mis à jour avec succès' };
  }

  // Renvoyer le code de vérification
  async resendVerificationCode(phone: string, type: 'registration' | 'phone_update', userId?: string) {
    let tempKey: string;
    let cachedData: any;

    if (type === 'registration') {
      tempKey = `registration_${phone}`;
      cachedData = await this.cacheService.get(tempKey);
    } else {
      if (!userId) {
        throw new BadRequestException('ID utilisateur requis pour la mise à jour du téléphone');
      }
      tempKey = `phone_update_${userId}`;
      cachedData = await this.cacheService.get(tempKey);
    }

    if (!cachedData) {
      throw new BadRequestException('Aucune demande de vérification en cours');
    }

    // Générer un nouveau code
    const newVerificationCode = this.twilioService.generateVerificationCode();
    cachedData.verificationCode = newVerificationCode;

    // Remettre en cache avec le nouveau code
    await this.cacheService.set(tempKey, cachedData, 1800);

    // Envoyer le nouveau SMS
    const message = type === 'registration' 
      ? `Votre nouveau code de vérification est: ${newVerificationCode}`
      : `Votre nouveau code de vérification pour changer de numéro est: ${newVerificationCode}`;

    await this.twilioService.sendSMS(phone, message);

    return { message: 'Nouveau code de vérification envoyé' };
  }
}
