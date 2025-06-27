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
import { Entreprise } from 'src/entreprise/entities/entreprise.entity';
import { ChangePasswordDto } from './dto/change-password.dto';



@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;
  private readonly DEFAULT_PASSWORD = '123456';

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

 private generateTokens(userId: string, phone: string, role: Role, entrepriseIds?: string[]) {
    const payload = {
      sub: userId,
      phone,
      role,
      entrepriseIds: entrepriseIds || [],
    }

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: "15m",
    })

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: "7d",
    })

    return { accessToken, refreshToken }
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByPhone(registerDto.telephone)
    if (existingUser) {
      throw new ConflictException("Un utilisateur avec ce numéro existe déjà")
    }

    const verificationCode = this.twilioService.generateVerificationCode()

    const tempKey = `registration_${registerDto.telephone}`
    await this.cacheService.set(
      tempKey,
      {
        ...registerDto,
        verificationCode,
        role: Role.ADMIN,
      },
      300,
    )

    await this.twilioService.sendSMS(registerDto.telephone, `Votre code de vérification est: ${verificationCode}`)

    return {
      message: "Code de vérification envoyé par SMS",
      phone: registerDto.telephone,
    }
  }

  async login(loginDto: LoginDto) {
    const { telephone, motDePasse } = loginDto

    const user = await this.usersService.findByPhoneWithEntreprises(telephone)
    if (!user) {
      throw new UnauthorizedException("Identifiants invalides")
    }

    if (!user.isActif) {
      throw new UnauthorizedException("Compte désactivé")
    }

    const isPasswordValid = await bcrypt.compare(motDePasse, user.motDePasse)
    if (!isPasswordValid) {
      throw new UnauthorizedException("Identifiants invalides")
    }

    // Vérifier si l'utilisateur utilise le mot de passe par défaut
    const isDefaultPassword = await bcrypt.compare(this.DEFAULT_PASSWORD, user.motDePasse)
    if (isDefaultPassword) {
      return {
        mustChangePassword: true,
        userId: user.idUtilisateur,
        message: "Vous devez changer votre mot de passe lors de votre première connexion",
      }
    }

    // Récupérer les entreprises de l'utilisateur
    const entrepriseIds = user.entreprises?.map((ue) => ue.entreprise.idEntreprise) || []

    const { motDePasse: _, ...userWithoutPassword } = user
    const tokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role, entrepriseIds)

    await this.cacheService.set(`refresh_token_${user.idUtilisateur}`, tokens.refreshToken, 604800)

    return {
      user: {
        ...userWithoutPassword,
        entreprises: user.entreprises?.map((ue) => ({
          id: ue.entreprise.idEntreprise,
          nom: ue.entreprise.nom,
          isOwner: ue.isOwner,
        })),
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    }
  }

  async changePasswordFirstLogin(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId)

    // Vérifier que l'utilisateur utilise encore le mot de passe par défaut
    const isDefaultPassword = await bcrypt.compare(this.DEFAULT_PASSWORD, user.motDePasse)
    if (!isDefaultPassword) {
      throw new BadRequestException("Ce compte ne nécessite pas de changement de mot de passe")
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(changePasswordDto.nouveauMotDePasse, 10)

    // Mettre à jour le mot de passe dans la base de données
    await this.usersService.updatePassword(userId, changePasswordDto.nouveauMotDePasse)

    // Récupérer l'utilisateur mis à jour avec ses entreprises
    const updatedUser = await this.usersService.findByIdWithEntreprises(userId)
    const entrepriseIds = updatedUser.entreprises?.map((ue) => ue.entreprise.idEntreprise) || []

    const { motDePasse: _, ...userWithoutPassword } = updatedUser
    const tokens = this.generateTokens(
      updatedUser.idUtilisateur,
      updatedUser.telephone,
      updatedUser.role,
      entrepriseIds,
    )

    await this.cacheService.set(`refresh_token_${updatedUser.idUtilisateur}`, tokens.refreshToken, 604800)

    return {
      user: {
        ...userWithoutPassword,
        entreprises: updatedUser.entreprises?.map((ue) => ({
          id: ue.entreprise.idEntreprise,
          nom: ue.entreprise.nom,
          isOwner: ue.isOwner,
        })),
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    }
  }

  getGoogleAuthUrl(): string {
    return this.googleClient.generateAuthUrl({
      access_type: "offline",
      scope: ["profile", "email"],
      redirect_uri: this.configService.get("GOOGLE_CALLBACK_URL"),
      state: "admin",
      prompt: "consent",
    })
  }

  getGoogleEmployeeAuthUrl(): string {
    const authUrl = this.googleClient.generateAuthUrl({
      access_type: "offline",
      scope: ["profile", "email"],
      redirect_uri: this.configService.get("GOOGLE_EMPLOYEE_CALLBACK_URL"),
      state: "employee",
    })
    return authUrl
  }

  async googleCallback(code: string, state: string) {
    try {
      const googleClient = new OAuth2Client(
        this.configService.get("GOOGLE_CLIENT_ID"),
        this.configService.get("GOOGLE_CLIENT_SECRET"),
        this.configService.get("GOOGLE_CALLBACK_URL"),
      )

      const tokenResponse = await googleClient.getToken(code)
      const tokens = tokenResponse.tokens
      googleClient.setCredentials(tokens)

      if (!tokens.id_token) {
        throw new UnauthorizedException("No ID token provided by Google")
      }

      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.configService.get("GOOGLE_CLIENT_ID"),
      })

      const payload = ticket.getPayload()
      if (!payload) {
        throw new UnauthorizedException("Token Google invalide")
      }

      const { email, name, sub: googleId } = payload
      if (!email) {
        throw new UnauthorizedException("Aucun email n'a pas été fourni par Google")
      }

      let user = await this.usersService.findByEmailWithEntreprises(email)
      if (!user) {
        const createUserDto: CreateUserDto = {
          nom: name ?? email.split("@")[0],
          email,
          telephone: `google_${googleId}`,
          role: Role.ADMIN,
          motDePasse: `googleoauth_${googleId}`,
        }
        user = await this.usersService.create(createUserDto)
      }

      if (!user.isActif) {
        throw new UnauthorizedException("Compte désactivé")
      }

      const entrepriseIds = user.entreprises?.map((ue) => ue.entreprise.idEntreprise) || []
      const { motDePasse, ...userWithoutPassword } = user
      const authTokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role, entrepriseIds)

      await this.cacheService.set(`refreshtoken_${user.idUtilisateur}`, authTokens.refreshToken, 604800)

      return {
        user: {
          ...userWithoutPassword,
          entreprises: user.entreprises?.map((ue) => ({
            id: ue.entreprise.idEntreprise,
            nom: ue.entreprise.nom,
            isOwner: ue.isOwner,
          })),
        },
        tokens: {
          accessToken: authTokens.accessToken,
          refreshToken: authTokens.refreshToken,
        },
      }
    } catch (error) {
      console.error("Erreur Google OAuth Callback:", error)
      throw new UnauthorizedException("Authentification Google échouée")
    }
  }

  async googleEmployeeCallback(code: string, state: string) {
    try {
      const googleClient = new OAuth2Client(
        this.configService.get("GOOGLE_CLIENT_ID"),
        this.configService.get("GOOGLE_CLIENT_SECRET"),
        this.configService.get("GOOGLE_EMPLOYEE_CALLBACK_URL"),
      )

      const tokenResponse = await googleClient.getToken(code)
      const tokens = tokenResponse.tokens
      googleClient.setCredentials(tokens)

      if (!tokens.id_token) {
        throw new UnauthorizedException("No ID token provided by Google")
      }

      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.configService.get("GOOGLE_CLIENT_ID"),
      })

      const payload = ticket.getPayload()
      if (!payload) {
        throw new UnauthorizedException("Token Google invalide")
      }

      const { email } = payload
      if (!email) {
        throw new UnauthorizedException("Aucun email n'a pas été fourni par Google")
      }

      const user = await this.usersService.findByEmailWithEntreprises(email)
      if (!user) {
        throw new UnauthorizedException("Compte non trouvé. Votre compte doit être créé par un administrateur.")
      }

      if (user.role === Role.ADMIN) {
        throw new UnauthorizedException("Les administrateurs doivent utiliser l'authentification principale")
      }

      if (!user.isActif) {
        throw new UnauthorizedException("Compte désactivé")
      }

      const entrepriseIds = user.entreprises?.map((ue) => ue.entreprise.idEntreprise) || []
      const { motDePasse, ...userWithoutPassword } = user
      const authTokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role, entrepriseIds)

      await this.cacheService.set(`refreshtoken_${user.idUtilisateur}`, authTokens.refreshToken, 604800)

      return {
        user: {
          ...userWithoutPassword,
          entreprises: user.entreprises?.map((ue) => ({
            id: ue.entreprise.idEntreprise,
            nom: ue.entreprise.nom,
            isOwner: ue.isOwner,
          })),
        },
        tokens: {
          accessToken: authTokens.accessToken,
          refreshToken: authTokens.refreshToken,
        },
      }
    } catch (error) {
      console.error("Erreur Google OAuth Employee Callback:", error)
      throw new UnauthorizedException("Authentification Google échouée")
    }
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      const { refreshToken } = refreshTokenDto

      const decoded = this.jwtService.verify(refreshToken)
      const userId = decoded.sub

      const storedToken = await this.cacheService.get(`refresh_token_${userId}`)
      if (!storedToken || storedToken !== refreshToken) {
        throw new UnauthorizedException("Refresh token invalide")
      }

      const user = await this.usersService.findByIdWithEntreprises(userId)
      if (!user || !user.isActif) {
        throw new UnauthorizedException("Utilisateur non trouvé ou inactif")
      }

      const entrepriseIds = user.entreprises?.map((ue) => ue.entreprise.idEntreprise) || []
      const tokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role, entrepriseIds)

      await this.cacheService.del(`refresh_token_${userId}`)
      await this.cacheService.set(`refresh_token_${userId}`, tokens.refreshToken, 604800)

      return {
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
      }
    } catch (error) {
      throw new UnauthorizedException("Refresh token invalide ou expiré")
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { telephone } = forgotPasswordDto

    const user = await this.usersService.findByPhone(telephone)
    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    if (user.role !== Role.ADMIN) {
      throw new BadRequestException("Cette fonctionnalité est réservée aux administrateurs")
    }

    const verificationCode = this.twilioService.generateVerificationCode()
    console.log(`Code généré pour ${telephone}: ${verificationCode}`)

    const cacheKey = `reset_password_${telephone}`
    const ttlSeconds = 600

    try {
      await this.cacheService.set(cacheKey, verificationCode, ttlSeconds)
      console.log(`Code stocké dans le cache avec la clé: ${cacheKey}`)

      const storedCode = await this.cacheService.get(cacheKey)
      console.log(`Code récupéré immédiatement: ${storedCode}`)

      if (!storedCode) {
        throw new Error("Erreur lors du stockage du code dans le cache")
      }
    } catch (error) {
      console.error("Erreur cache:", error)
      throw new BadRequestException("Erreur lors de la génération du code")
    }

    const message = `Votre code de réinitialisation: ${verificationCode}. Ce code expire dans 10 minutes.`

    try {
      await this.twilioService.sendSMS(telephone, message)
      console.log(`SMS envoyé à ${telephone}`)
    } catch (error) {
      console.error("Erreur SMS:", error)
      await this.cacheService.del(cacheKey)
      throw new BadRequestException("Erreur lors de l'envoi du SMS")
    }

    return {
      message: "Code de vérification envoyé par SMS",
      debug: {
        codeGenerated: verificationCode,
        cacheKey: cacheKey,
        ttl: ttlSeconds,
      },
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { telephone, codeVerification, nouveauMotDePasse } = resetPasswordDto

    const cacheKey = `reset_password_${telephone}`

    console.log(`Tentative de récupération du code pour: ${cacheKey}`)

    const storedCode = await this.cacheService.get(cacheKey)
    console.log(`Code stocké: ${storedCode}, Code fourni: ${codeVerification}`)

    if (!storedCode) {
      console.log("Aucun code trouvé dans le cache")
      throw new BadRequestException("Code de vérification expiré ou inexistant")
    }

    if (storedCode !== codeVerification) {
      console.log("Code de vérification incorrect")
      throw new BadRequestException("Code de vérification invalide")
    }

    const user = await this.usersService.findByPhone(telephone)
    if (!user) {
      throw new NotFoundException("Utilisateur non trouvé")
    }

    try {
      await this.usersService.updatePassword(user.idUtilisateur, nouveauMotDePasse)

      await this.cacheService.del(cacheKey)
      console.log(`Code supprimé du cache: ${cacheKey}`)

      return { message: "Mot de passe réinitialisé avec succès" }
    } catch (error) {
      console.error("Erreur lors de la réinitialisation:", error)
      throw new BadRequestException("Erreur lors de la réinitialisation du mot de passe")
    }
  }

  async createUser(createUserDto: CreateUserDto, adminId: string, entrepriseId?: string) {
    const admin = await this.usersService.findById(adminId)
    if (admin.role !== Role.ADMIN) {
      throw new UnauthorizedException("Seuls les administrateurs peuvent créer des utilisateurs")
    }

    if (!entrepriseId) {
      throw new BadRequestException("L'identifiant de l'entreprise est requis")
    }

    // Utiliser le mot de passe par défaut
    const userDataWithPassword: CreateUserDto = {
      ...createUserDto,
      motDePasse: this.DEFAULT_PASSWORD,
    }

    const user = await this.usersService.createUserForEntreprise(entrepriseId, userDataWithPassword)
    const { motDePasse, ...userWithoutPassword } = user

    return {
      user: userWithoutPassword,
      defaultPassword: this.DEFAULT_PASSWORD,
    }
  }

  async logout(token: string, userId?: string) {
    try {
      const decoded = this.jwtService.decode(token)
      if (decoded && typeof decoded === "object" && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000)
        await this.cacheService.set(`blacklist_${token}`, true, ttl)
      }

      if (userId) {
        await this.cacheService.del(`refresh_token_${userId}`)
      }

      return { message: "Déconnexion réussie" }
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error)
      return { message: "Déconnexion réussie" }
    }
  }

  async verifyPhoneAndRegister(verifyPhoneDto: VerifyPhoneDto) {
    const tempKey = `registration_${verifyPhoneDto.code}`
    const registrationData = await this.cacheService.get(tempKey)

    if (!registrationData) {
      throw new BadRequestException("Code de vérification expiré ou invalide")
    }

    if (registrationData.verificationCode !== verifyPhoneDto.code) {
      throw new BadRequestException("Code de vérification incorrect")
    }

    const createUserDto: CreateUserDto = {
      ...registrationData,
      motDePasse: registrationData.motDePasse,
    }

    const user = await this.usersService.create(createUserDto)
    const { motDePasse, ...userWithoutPassword } = user

    const tokens = this.generateTokens(user.idUtilisateur, user.telephone, user.role, [])

    await this.cacheService.set(`refresh_token_${user.idUtilisateur}`, tokens.refreshToken, 604800)

    await this.cacheService.del(tempKey)

    return {
      user: userWithoutPassword,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    }
  }

  async updatePassword(userId: string, updatePasswordDto: UpdatePasswordDto) {
    const user = await this.usersService.findById(userId)

    const isOldPasswordValid = await bcrypt.compare(updatePasswordDto.ancienMotDePasse, user.motDePasse)

    if (!isOldPasswordValid) {
      throw new BadRequestException("Ancien mot de passe incorrect")
    }

    await this.usersService.updatePassword(userId, updatePasswordDto.nouveauMotDePasse)

    return { message: "Mot de passe mis à jour avec succès" }
  }

  async updatePhoneNumber(userId: string, updatePhoneDto: UpdatePhoneDto) {
    const existingUser = await this.usersService.findByPhone(updatePhoneDto.nouveauTelephone)
    if (existingUser && existingUser.idUtilisateur !== userId) {
      throw new ConflictException("Ce numéro de téléphone est déjà utilisé")
    }

    const verificationCode = this.twilioService.generateVerificationCode()

    const tempKey = `phone_update_${userId}`
    await this.cacheService.set(
      tempKey,
      {
        userId,
        nouveauTelephone: updatePhoneDto.nouveauTelephone,
        verificationCode,
      },
      1800,
    )

    await this.twilioService.sendSMS(
      updatePhoneDto.nouveauTelephone,
      `Votre code de vérification pour changer de numéro est: ${verificationCode}`,
    )

    return {
      message: "Code de vérification envoyé au nouveau numéro",
      phone: updatePhoneDto.nouveauTelephone,
    }
  }

  async verifyAndUpdatePhone(userId: string, verifyPhoneDto: VerifyPhoneDto) {
    const tempKey = `phone_update_${userId}`
    const updateData = await this.cacheService.get(tempKey)

    if (!updateData) {
      throw new BadRequestException("Code de vérification expiré ou invalide")
    }

    if (updateData.verificationCode !== verifyPhoneDto.code) {
      throw new BadRequestException("Code de vérification incorrect")
    }

    await this.usersService.updatePhone(userId, updateData.nouveauTelephone)

    await this.cacheService.del(tempKey)

    await this.cacheService.del(`refresh_token_${userId}`)

    return { message: "Numéro de téléphone mis à jour avec succès" }
  }

  async resendVerificationCode(phone: string, type: "registration" | "phone_update", userId?: string) {
    let tempKey: string
    let cachedData: any

    if (type === "registration") {
      tempKey = `registration_${phone}`
      cachedData = await this.cacheService.get(tempKey)
    } else {
      if (!userId) {
        throw new BadRequestException("ID utilisateur requis pour la mise à jour du téléphone")
      }
      tempKey = `phone_update_${userId}`
      cachedData = await this.cacheService.get(tempKey)
    }

    if (!cachedData) {
      throw new BadRequestException("Aucune demande de vérification en cours")
    }

    const newVerificationCode = this.twilioService.generateVerificationCode()
    cachedData.verificationCode = newVerificationCode

    await this.cacheService.set(tempKey, cachedData, 1800)

    const message =
      type === "registration"
        ? `Votre nouveau code de vérification est: ${newVerificationCode}`
        : `Votre nouveau code de vérification pour changer de numéro est: ${newVerificationCode}`

    await this.twilioService.sendSMS(phone, message)

    return { message: "Nouveau code de vérification envoyé" }
  }
}
