import axios from 'axios'
import { Injectable, InternalServerErrorException } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import type { Repository } from "typeorm"

@Injectable()
export class NotificationService {
     private locationCache: Map<string, string> = new Map();


 // Fonction pour générer une clé de cache basée sur les coordonnées
   getLocationCacheKey(latitude: number, longitude: number): string {
    return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  }

  // Fonction pour convertir des coordonnées en nom de lieu avec plusieurs API et gestion d'erreurs
   async getLocationName(coordinates: number[]): Promise<string> {
    if (!coordinates || coordinates.length !== 2) {
      return 'Lieu non spécifié';
    }
    
    const [latitude, longitude] = coordinates;
    const cacheKey = this.getLocationCacheKey(latitude, longitude);
    
    // Vérifier si le résultat est déjà en cache
    const cached = this.locationCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Liste des API de géocodage à essayer (dans l'ordre)
    const geocodingApis = [
      this.tryNominatimApi.bind(this),      // OpenStreetMap (gratuit)
      this.tryBigDataCloudApi.bind(this),   // API alternative
      this.tryPositionStackApi.bind(this)   // Autre API alternative
    ];
    
    // Essayer chaque API jusqu'à ce qu'une fonctionne
    for (const apiFunction of geocodingApis) {
      try {
        const locationName = await apiFunction(latitude, longitude);
        if (locationName) {
          // Mettre en cache le résultat pour une utilisation future
          this.locationCache.set(cacheKey, locationName);
          return locationName;
        }
      } catch (error) {
        console.error(`Erreur avec une API de géocodage: ${error.message || error}`);
        // Continuer avec la prochaine API
      }
    }
    
    // Si toutes les API échouent, retourner les coordonnées formatées
    const formattedCoordinates = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    this.locationCache.set(cacheKey, formattedCoordinates);
    return formattedCoordinates;
  }
  
  // API Nominatim (OpenStreetMap)
   async tryNominatimApi(latitude: number, longitude: number): Promise<string> {
    const MAX_RETRIES = 3;
    const INITIAL_TIMEOUT = 5000;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const timeout = INITIAL_TIMEOUT * attempt;
        const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
          params: {
            lat: latitude,
            lon: longitude,
            format: 'json',
            zoom: 10, // Niveau de détail réduit pour des résultats plus rapides
            addressdetails: 1
          },
          headers: {
            'User-Agent': 'GestionApp/1.0 (contact@votre-domaine.com)',
            'Accept-Language': 'fr'
          },
          timeout
        });
        
        if (response.data?.address) {
          const { address } = response.data;
          const parts = [
            address.village,
            address.town,
            address.city,
            address.municipality,
            address.county,
            address.state,
            address.country
          ].filter(Boolean);
          
          return parts.join(', ') || 'Lieu inconnu';
        }
        
        return response.data?.display_name || 'Lieu inconnu';
        
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          console.error(`Échec après ${MAX_RETRIES} tentatives avec Nominatim API`, error);
          throw error;
        }
        // Attente exponentielle avant de réessayer
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    return 'Lieu inconnu';
  }
  
  // API BigDataCloud (alternative)
   async tryBigDataCloudApi(latitude: number, longitude: number): Promise<string> {
    try {
      const response = await axios.get(`https://api.bigdatacloud.net/data/reverse-geocode-client`, {
        params: {
          latitude,
          longitude,
          localityLanguage: 'fr'
        },
        timeout: 5000
      });
      
      if (response.data) {
        const { locality, city, principalSubdivision, countryName } = response.data;
        
        if (locality && countryName) {
          return `${locality}, ${countryName}`;
        } else if (city && countryName) {
          return `${city}, ${countryName}`;
        } else if (principalSubdivision && countryName) {
          return `${principalSubdivision}, ${countryName}`;
        } else if (countryName) {
          return countryName;
        }
      }
      
      return "lieu inconue";
    } catch (error) {
      console.error('Erreur avec BigDataCloud API:', error.message || error);
      throw error;
    }
  }
  
  // API PositionStack (autre alternative - nécessite une clé API)
   async tryPositionStackApi(latitude: number, longitude: number): Promise<string> {
    // Si vous n'avez pas de clé API PositionStack, cette méthode échouera
    // Vous pouvez en obtenir une gratuitement sur https://positionstack.com/
    const apiKey = process.env.POSITIONSTACK_API_KEY;
    if (!apiKey) {
      throw new Error('Clé API PositionStack non configurée');
    }
    
    try {
      const response = await axios.get(`http://api.positionstack.com/v1/reverse`, {
        params: {
          access_key: apiKey,
          query: `${latitude},${longitude}`,
          limit: 1
        },
        timeout: 5000
      });
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        const location = response.data.data[0];
        if (location.locality && location.country) {
          return `${location.locality}, ${location.country}`;
        } else if (location.region && location.country) {
          return `${location.region}, ${location.country}`;
        } else if (location.country) {
          return location.country;
        }
      }
      
      return "lieu inconue";
    } catch (error) {
      console.error('Erreur avec PositionStack API:', error.message || error);
      throw error;
    }
  }
}