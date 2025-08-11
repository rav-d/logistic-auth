// TIR Browser Platform - Correlation ID Tests
// Unit tests for correlation ID middleware and validation

const { generateCorrelationId, validateCorrelationId } = require('../../src/middleware/correlation');

describe('Correlation ID', () => {
    describe('generateCorrelationId', () => {
        test('should generate correlation ID with correct format', () => {
            const correlationId = generateCorrelationId();
            
            expect(correlationId).toMatch(/^cid-\d+-[a-z0-9]{9}$/);
            expect(correlationId).toContain('cid-');
        });
        
        test('should generate unique correlation IDs', () => {
            const id1 = generateCorrelationId();
            const id2 = generateCorrelationId();
            
            expect(id1).not.toBe(id2);
        });
        
        test('should include timestamp in correlation ID', () => {
            const beforeTime = Date.now();
            const correlationId = generateCorrelationId();
            const afterTime = Date.now();
            
            const timestampPart = correlationId.split('-')[1];
            const timestamp = parseInt(timestampPart);
            
            expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
            expect(timestamp).toBeLessThanOrEqual(afterTime);
        });
    });
    
    describe('validateCorrelationId', () => {
        test('should validate correct correlation ID format', () => {
            const validId = 'cid-1703123456789-k2j8h9x3q';
            expect(validateCorrelationId(validId)).toBe(true);
        });
        
        test('should reject invalid formats', () => {
            const invalidIds = [
                '',
                null,
                undefined,
                'invalid-format',
                'cid-123',
                'cid-abc-def',
                'cid-1703123456789-short',
                'cid-1703123456789-toolongstring',
                'wrong-1703123456789-k2j8h9x3q'
            ];
            
            invalidIds.forEach(id => {
                expect(validateCorrelationId(id)).toBe(false);
            });
        });
        
        test('should validate generated correlation IDs', () => {
            for (let i = 0; i < 10; i++) {
                const generatedId = generateCorrelationId();
                expect(validateCorrelationId(generatedId)).toBe(true);
            }
        });
    });
});