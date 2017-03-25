import { RelationshipInfo } from './relationships';

export type Hooks = keyof BeforeSave | keyof AfterSave |
    keyof BeforeJoin | keyof AfterJoin |
    keyof BeforeDelete | keyof AfterDelete |
    keyof AfterRetrieve;

/**
 * Save hooks are called before and after saving to the db.
 */
export interface BeforeSave {
    beforeSave(): void;
}

export interface AfterSave {
    afterSave(): void;
}

/**
 * Join hooks are called before and after joining a relationship
 */
export interface BeforeJoin {
    beforeJoin(relationship: RelationshipInfo): void;
}

export interface AfterJoin {
    afterJoin(relationship: RelationshipInfo): void;
}

/**
 * Retrieve hooks are called after a model is retrieved from the db.
 */
export interface AfterRetrieve {
    afterRetrieve(): void;
}

/**
 * Delete hooks are called before and after a model is deleted from the db.
 */
export interface BeforeDelete {
    beforeDelete(): void;
}

export interface AfterDelete {
    afterDelete(): void;
}
