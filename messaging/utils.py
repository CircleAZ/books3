"""Spintax utility for message variation."""
import re
import random


def expand_spintax(text, seed=None):
    """
    Expand Spintax notation to generate varied messages.
    
    Spintax format: {option1|option2|option3}
    Nested spintax is supported: {Hi|Hello {friend|buddy}}
    
    Args:
        text: String containing Spintax notation
        seed: Optional random seed for reproducible output
        
    Returns:
        Expanded string with random selections
        
    Example:
        >>> expand_spintax("{Hi|Hello} {friend|there}!")
        "Hello friend!"  # or other variation
    """
    if seed is not None:
        random.seed(seed)
    
    # Keep expanding until no more Spintax patterns exist
    pattern = r'\{([^{}]+)\}'
    max_iterations = 10  # Prevent infinite loops
    iterations = 0
    
    while re.search(pattern, text) and iterations < max_iterations:
        text = re.sub(
            pattern,
            lambda m: random.choice(m.group(1).split('|')),
            text
        )
        iterations += 1
    
    return text


def get_all_variations(text, max_variations=100):
    """
    Generate all possible variations from Spintax.
    
    Args:
        text: String containing Spintax notation
        max_variations: Maximum number of variations to return
        
    Returns:
        List of all possible expanded strings
    """
    from itertools import product
    
    # Find all Spintax patterns
    pattern = r'\{([^{}]+)\}'
    matches = re.findall(pattern, text)
    
    if not matches:
        return [text]
    
    # Get options for each pattern
    options = [m.split('|') for m in matches]
    
    # Generate all combinations
    variations = []
    for combo in product(*options):
        result = text
        for i, match in enumerate(matches):
            result = result.replace(f'{{{match}}}', combo[i], 1)
        variations.append(result)
        
        if len(variations) >= max_variations:
            break
    
    return variations


def count_variations(text):
    """
    Count total possible variations in Spintax text.
    
    Returns:
        Integer count of possible variations
    """
    pattern = r'\{([^{}]+)\}'
    matches = re.findall(pattern, text)
    
    if not matches:
        return 1
    
    count = 1
    for match in matches:
        count *= len(match.split('|'))
    
    return count


def validate_spintax(text):
    """
    Validate Spintax syntax.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check for balanced braces
    open_count = text.count('{')
    close_count = text.count('}')
    
    if open_count != close_count:
        return False, f"Unbalanced braces: {open_count} open, {close_count} close"
    
    # Check for empty options
    if '{}' in text or '{|}' in text:
        return False, "Empty Spintax option found"
    
    # Check for nested braces (not supported in simple mode)
    pattern = r'\{[^{}]*\{.*\}[^{}]*\}'
    if re.search(pattern, text):
        return False, "Nested braces detected - use flat Spintax"
    
    return True, None
