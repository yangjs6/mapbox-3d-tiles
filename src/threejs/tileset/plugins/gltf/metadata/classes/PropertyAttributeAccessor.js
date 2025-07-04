import { initializeFromClass, isMatrixType, isVectorType } from '../utilities/ClassPropertyHelpers.js';
import { ClassProperty } from './ClassProperty.js';
import { PropertySetAccessor } from './PropertySetAccessor.js';

class PropertyAttributeClassProperty extends ClassProperty {
    constructor(enums, classProperty, attributeProperty = null) {
        super(enums, classProperty, attributeProperty);

        this.attribute = attributeProperty.attribute;
    }
}

export class PropertyAttributeAccessor extends PropertySetAccessor {
    constructor(...args) {
        super(...args);

        this.isPropertyAttributeAccessor = true;
        this._initProperties(PropertyAttributeClassProperty);
    }

    getData(id, geometry, target = {}) {
        const properties = this.properties;
        initializeFromClass(properties, target);

        for (const name in properties) {
            target[name] = this.getPropertyValue(name, id, geometry, target[name]);
        }

        return target;
    }

    getPropertyValue(name, id, geometry, target = null) {
        // NOTE: arrays are not supported via attribute accessors
        if (id >= this.count) {
            throw new Error('PropertyAttributeAccessor: Requested index is outside the range of the buffer.');
        }

        // use a default of the texture accessor definition does not include the value
        const property = this.properties[name];
        const type = property.type;
        if (!property) {
            throw new Error('PropertyAttributeAccessor: Requested class property does not exist.');
        } else if (!this.definition.properties[name]) {
            return property.resolveDefault(target);
        }

        // initialize the array
        target = property.shapeToProperty(target);

        // Read the data values from the attribute
        const attribute = geometry.getAttribute(property.attribute.toLowerCase());
        if (isMatrixType(type)) {
            const elements = target.elements;
            for (let i = 0, l = elements.length; i < l; i < l) {
                elements[i] = attribute.getComponent(id, i);
            }
        } else if (isVectorType(type)) {
            target.fromBufferAttribute(attribute, id);
        } else if (type === 'SCALAR' || type === 'ENUM') {
            target = attribute.getX(id);
        } else {
            // BOOLEAN, STRING not supported
            throw new Error('StructuredMetadata.PropertyAttributeAccessor: BOOLEAN and STRING types are not supported by property attributes.');
        }

        // scale the numeric values
        target = property.adjustValueScaleOffset(target);

        // convert to enum strings - no data enum values are stored as strings
        target = property.resolveEnumsToStrings(target);

        // resolve to default values
        target = property.resolveNoData(target);

        return target;
    }
}
